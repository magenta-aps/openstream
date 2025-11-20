# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only

from datetime import datetime
import math
from logging import getLogger
import secrets
import textwrap
from typing import List, Set
from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import EmailMultiAlternatives
from django.core.management import BaseCommand
from django.template.loader import render_to_string

from app.models import OrganisationMembership
from osauth.keycloak import (
    KeycloakAdminClient,
    KeycloakError,
    TokenResponse,
    UserRepresentation,
    kc_client_from_settings,
)

logger = getLogger("django.management.cmd")


class Command(BaseCommand):
    verbose = False
    dry_run = False
    batch_size = 100
    compare_field = "username"
    temp_password = ""

    def add_arguments(self, parser):
        # Required arguments
        parser.add_argument("realm", type=str)

        # Optional arguments
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="Print all INFO logs.",
        )
        parser.add_argument(
            "--dry_run",
            action="store_true",
            help="Prevent actual changes and just show what will happen.",
        )
        parser.add_argument(
            "--batch_size",
            type=int,
            default=self.batch_size,
            help=f"Number of users to process per batch (default: {self.batch_size}).",
        )
        parser.add_argument(
            "--compare_field",
            type=str,
            default=self.compare_field,
            help=f"What user-field to use for getting Keycloak user equivilent (default: {self.batch_size}).",
        )
        parser.add_argument(
            "--temp_password",
            type=str,
            default=self.temp_password,
            help=f"Number of users to process per batch (default: {self.batch_size}).",
        )

    def get_django_users(
        self, kc_users: List[UserRepresentation], django_users_total: int
    ):
        users_to_create: List[User] = []
        users_to_update: List[User] = []

        num_batches = math.ceil(django_users_total / self.batch_size)
        for batch_index in range(num_batches):
            start = batch_index * self.batch_size
            end = start + self.batch_size
            users = User.objects.all().order_by("id")[start:end]

            if self.verbose:
                self.stdout.write(
                    f"Processing batch {batch_index + 1}/{num_batches} "
                    f"({len(users)} users)"
                )

            for user in users:
                if not user.email:
                    if self.verbose:
                        logger.warning(
                            f"  - {user.username} - Missing 'email' - skipping"
                        )
                    continue

                if self.verbose:
                    logger.info(f"  - {user.username}")

                kc_user_equivilent = next(
                    (
                        kc_user
                        for kc_user in kc_users
                        if kc_user.username == user.username
                    ),
                    None,
                )

                if not kc_user_equivilent:
                    users_to_create.append(user)
                    continue

                # TODO: Check if user needs to be updated

        return users_to_create, users_to_update

    def get_django_user_org_memberships(
        self, user: User
    ) -> tuple[bool, Set[int], Set[int], Set[int], Set[int]]:
        user_memberships = OrganisationMembership.objects.filter(user=user)
        return (
            user_memberships.filter(role="super_admin").count() > 0,
            set(
                user_memberships.filter(role="org_admin").values_list(
                    "organisation_id", flat=True
                )
            ),
            set(
                user_memberships.filter(role="suborg_admin").values_list(
                    "suborganisation_id", flat=True
                )
            ),
            set(
                user_memberships.filter(role="branch_admin").values_list(
                    "branch_id", flat=True
                )
            ),
            set(
                user_memberships.filter(role="employee").values_list(
                    "organisation_id", flat=True
                )
            ),
        )

    def create_django_users_in_keycloak(
        self, token: TokenResponse, django_users: List[User]
    ) -> tuple[List[UserRepresentation], List[UserRepresentation]]:
        kc_users_created: List[UserRepresentation] = []
        kc_users_created_failed: List[UserRepresentation] = []

        for user in django_users:
            (
                super_admin_membership,
                org_admin_memberships,
                subOrg_admin_memberships,
                branch_admin_memberships,
                employee_memberships,
            ) = self.get_django_user_org_memberships(user.id)

            # Create the user in Keycloak
            new_kc_user = UserRepresentation(
                username=user.username,
                email=user.email,
                # NOTE: `emailVerified=True` since we will send a password-reset mail
                emailVerified=True,
                enabled=True,
                attributes={
                    settings.OSAUTH_KC_USER_ATTR_ORG_ADMIN: [
                        ",".join(str(om) for om in org_admin_memberships)
                    ],
                    settings.OSAUTH_KC_USER_ATTR_SUBORG_ADMIN: [
                        ",".join(str(om) for om in subOrg_admin_memberships)
                    ],
                    settings.OSAUTH_KC_USER_ATTR_BRANCH_ADMIN: [
                        ",".join(str(om) for om in branch_admin_memberships)
                    ],
                    settings.OSAUTH_KC_USER_ATTR_ORG_EMPLOYEE: [
                        ",".join(str(om) for om in employee_memberships)
                    ],
                },
            )

            if self.dry_run:
                kc_users_created.append(new_kc_user)
                continue

            try:
                new_kc_user.id = self.kc_adm.create_realm_user(
                    token, self.realm, new_kc_user
                )
                kc_users_created.append(new_kc_user)

                # Check if we need to assign "super_admin" priviliges
                if super_admin_membership:
                    kc_role_super_admin = self.kc_adm.get_realm_role(
                        token, self.realm, "super_admin"
                    )

                    self.kc_adm.add_realm_role_to_user(
                        token,
                        self.realm,
                        new_kc_user.id,
                        kc_role_super_admin,
                    )
            except KeycloakError:
                logger.exception("Failed to create keycloak user")
                kc_users_created_failed.append(user)

        return kc_users_created, kc_users_created_failed

    def get_password_reset_email(
        self, kc_user: UserRepresentation, temporary_password: str
    ):
        mail_template_vars = {
            "user_username": kc_user.username,
            "reset_datetime": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "temporary_password": temporary_password,
            "os_url": f"{settings.FRONTEND_HOST}/{self.realm}/sign-in",
        }

        email = EmailMultiAlternatives(
            "OpenStream authentication migration - Password Reset",
            render_to_string(
                "email/password_reset_email.txt",
                context=mail_template_vars,
            ).strip(),
            settings.DEFAULT_FROM_EMAIL,
            [kc_user.email],
        )
        email.attach_alternative(
            render_to_string(
                "email/password_reset_email.html",
                context=mail_template_vars,
            ).strip(),
            "text/html",
        )
        return email

    def handle(self, *args, **options):
        logger.info("Sync Users Management Command")
        logger.info("-----------------------------")
        self.realm = options["realm"]
        self.verbose = options["verbose"]
        self.dry_run = options["dry_run"]
        self.batch_size = options["batch_size"]
        self.compare_field = options["compare_field"]
        self.temp_password = options["temp_password"]

        # Configure keycloak clients
        self.kc_client = kc_client_from_settings()
        self.kc_adm = KeycloakAdminClient(
            host=settings.KEYCLOAK_HOST,
            port=settings.KEYCLOAK_PORT,
            client_id="admin-cli",
        )

        # Get Keycloak users
        kc_token = self.kc_adm.auth(
            username=settings.KEYCLOAK_ADMIN_USERNAME,
            password=settings.KEYCLOAK_ADMIN_PASSWORD,
        )

        kc_users_total = self.kc_adm.count_realm_users(kc_token, self.realm)
        logger.info(f"Total Keycloak-users: {kc_users_total}")
        kc_users = self.kc_adm.list_realm_users(kc_token, self.realm, kc_users_total)

        # Get local users
        django_users_total = User.objects.count()
        logger.info(f"Total Django-users: {django_users_total}")
        django_users_to_create, django_users_to_update = self.get_django_users(
            kc_users, django_users_total
        )

        # Perform creates
        kc_users_created, kc_users_created_failed = (
            self.create_django_users_in_keycloak(kc_token, django_users_to_create)
        )

        # TODO: Perform updates
        kc_users_updated = []
        kc_users_updated_fails = []

        # Handle password reset for new users
        password_resets_performed: List[str] = []
        password_resets_fails: List[str] = []
        password_resets_total = len(kc_users_created)

        if self.temp_password:
            logger.warning(
                "\nTEMP_PASSWORD is active - "
                "Temporary password set directly instead of generating a random "
                "password and sending by email."
            )

        for kc_user in kc_users_created:
            if self.temp_password:
                try:
                    if not self.dry_run:
                        self.kc_adm.set_realm_user_password(
                            kc_token,
                            self.realm,
                            kc_user.id,
                            self.temp_password,
                        )
                    password_resets_performed.append(kc_user.id)
                except KeycloakError:
                    logger.exception("Error sending password-reset mail")
                    password_resets_fails.append(kc_user.id)
                continue

            if not kc_user.email:
                logger.warning(
                    f"User '{kc_user.username}' is missing a valid 'email' - Skipping password-reset email!"
                )
                continue

            # Generate, and persist, new temporary password for the user
            temp_pass = secrets.token_urlsafe(8)

            try:
                if not self.dry_run:
                    self.kc_adm.set_realm_user_password(
                        kc_token, self.realm, kc_user.id, temp_pass
                    )
            except KeycloakError:
                logger.exception("Error sending password-reset mail")
                password_resets_fails.append(kc_user.id)
                continue

            # Send mail with temp password
            email = self.get_password_reset_email(kc_user, temp_pass)

            try:
                if not self.dry_run:
                    email.send()
                else:
                    if self.verbose:
                        logger.info("\nThe following email would have been sent:")
                        logger.info("-----------------------------------------")
                        logger.info("> " + "\n> ".join(email.body.splitlines()))

                password_resets_performed.append(kc_user.id)
            except Exception:
                logger.exception("Error sending password-reset mail")
                password_resets_fails.append(kc_user.id)

        # Final report
        logger.info("\nReport:")
        logger.info("-----------------------------")
        logger.info(
            f"  - Created users: {len(kc_users_created)} / {len(django_users_to_create)}"
        )
        logger.info(
            f"  - Updated users: {len(kc_users_updated)} / {len(django_users_to_update)}"
        )
        logger.info(
            f"  - Password resets: {len(password_resets_performed)} / {password_resets_total}"
        )
