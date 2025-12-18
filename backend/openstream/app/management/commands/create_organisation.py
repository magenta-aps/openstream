# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2025 Magenta ApS, https://magenta.dk.
# Contact: info@magenta.dk.

from django.core.management.base import BaseCommand
from django.db import transaction
from django.contrib.auth.models import User

from app.models import (
    Organisation,
    SubOrganisation,
    Branch,
    OrganisationMembership,
)


class Command(BaseCommand):
    help = (
        "Create an Organisation and also create a SubOrganisation named 'Global' "
        "and a Branch named 'Global' for that organisation."
    )

    def add_arguments(self, parser):
        parser.add_argument("name", type=str, help="Organisation display name")
        parser.add_argument(
            "uri_name", type=str, help="Organisation URI-safe name (slug)"
        )

    def handle(self, *args, **options):
        name = options["name"]
        uri_name = options["uri_name"]

        with transaction.atomic():
            org, org_created = Organisation.objects.get_or_create(
                uri_name=uri_name, defaults={"name": name}
            )

            if not org_created and org.name != name:
                org.name = name
                org.save()

            suborg, sub_created = SubOrganisation.objects.get_or_create(
                organisation=org, name="Global"
            )

            branch, branch_created = Branch.objects.get_or_create(
                suborganisation=suborg, name="Global"
            )

            # Also create a demo suborganisation and demo branch
            demo_suborg, demo_sub_created = SubOrganisation.objects.get_or_create(
                organisation=org, name="Demo Suborg"
            )

            demo_branch, demo_branch_created = Branch.objects.get_or_create(
                suborganisation=demo_suborg, name="Demo Branch"
            )

            # Create users for this organisation: suborg admin and employee
            suborg_admin_username = f"{uri_name}_suborg_admin"
            employee_username = f"{uri_name}_employee"

            suborg_admin_user, sa_created = User.objects.get_or_create(
                username=suborg_admin_username,
                defaults={
                    "first_name": "",
                    "last_name": "",
                    "email": "",
                },
            )
            if sa_created:
                suborg_admin_user.set_password(suborg_admin_username)
                suborg_admin_user.save()

            employee_user, emp_created = User.objects.get_or_create(
                username=employee_username,
                defaults={
                    "first_name": "",
                    "last_name": "",
                    "email": "",
                },
            )
            if emp_created:
                employee_user.set_password(employee_username)
                employee_user.save()

            # Create or update OrganisationMembership for suborg admin (Demo Suborg)
            suborg_membership, suborg_mem_created = (
                OrganisationMembership.objects.get_or_create(
                    user=suborg_admin_user,
                    organisation=org,
                    suborganisation=demo_suborg,
                    branch=None,
                    defaults={"role": "suborg_admin"},
                )
            )
            if not suborg_mem_created and suborg_membership.role != "suborg_admin":
                suborg_membership.role = "suborg_admin"
                suborg_membership.save()

            # Create or update OrganisationMembership for employee (Demo Branch)
            employee_membership, emp_mem_created = (
                OrganisationMembership.objects.get_or_create(
                    user=employee_user,
                    organisation=org,
                    suborganisation=demo_suborg,
                    branch=demo_branch,
                    defaults={"role": "employee"},
                )
            )
            if not emp_mem_created and employee_membership.role != "employee":
                employee_membership.role = "employee"
                employee_membership.save()

        if org_created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Organisation created: {org.name} (uri_name={org.uri_name})"
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"Organisation exists: {org.name} (uri_name={org.uri_name})"
                )
            )

        if sub_created:
            self.stdout.write(
                self.style.SUCCESS(f"SubOrganisation created: {suborg.name}")
            )
        else:
            self.stdout.write(
                self.style.NOTICE(f"SubOrganisation exists: {suborg.name}")
            )

        if branch_created:
            self.stdout.write(self.style.SUCCESS(f"Branch created: {branch.name}"))
        else:
            self.stdout.write(self.style.NOTICE(f"Branch exists: {branch.name}"))

        if demo_sub_created:
            self.stdout.write(
                self.style.SUCCESS(f"SubOrganisation created: {demo_suborg.name}")
            )
        else:
            self.stdout.write(
                self.style.NOTICE(f"SubOrganisation exists: {demo_suborg.name}")
            )

        if demo_branch_created:
            self.stdout.write(self.style.SUCCESS(f"Branch created: {demo_branch.name}"))
        else:
            self.stdout.write(self.style.NOTICE(f"Branch exists: {demo_branch.name}"))
