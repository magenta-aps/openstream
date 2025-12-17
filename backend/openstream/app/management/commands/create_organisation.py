from django.core.management.base import BaseCommand
from django.db import transaction

from app.models import Organisation, SubOrganisation, Branch


class Command(BaseCommand):
    help = (
        "Create an Organisation and also create a SubOrganisation named 'Global' "
        "and a Branch named 'Global' for that organisation."
    )

    def add_arguments(self, parser):
        parser.add_argument('name', type=str, help='Organisation display name')
        parser.add_argument('uri_name', type=str, help='Organisation URI-safe name (slug)')

    def handle(self, *args, **options):
        name = options['name']
        uri_name = options['uri_name']

        with transaction.atomic():
            org, org_created = Organisation.objects.get_or_create(
                uri_name=uri_name, defaults={'name': name}
            )

            if not org_created and org.name != name:
                org.name = name
                org.save()

            suborg, sub_created = SubOrganisation.objects.get_or_create(
                organisation=org, name='Global'
            )

            branch, branch_created = Branch.objects.get_or_create(
                suborganisation=suborg, name='Global'
            )

            # Also create a demo suborganisation and demo branch
            demo_suborg, demo_sub_created = SubOrganisation.objects.get_or_create(
                organisation=org, name='Demo Suborg'
            )

            demo_branch, demo_branch_created = Branch.objects.get_or_create(
                suborganisation=demo_suborg, name='Demo Branch'
            )

        if org_created:
            self.stdout.write(self.style.SUCCESS(f"Organisation created: {org.name} (uri_name={org.uri_name})"))
        else:
            self.stdout.write(self.style.WARNING(f"Organisation exists: {org.name} (uri_name={org.uri_name})"))

        if sub_created:
            self.stdout.write(self.style.SUCCESS(f"SubOrganisation created: {suborg.name}"))
        else:
            self.stdout.write(self.style.NOTICE(f"SubOrganisation exists: {suborg.name}"))

        if branch_created:
            self.stdout.write(self.style.SUCCESS(f"Branch created: {branch.name}"))
        else:
            self.stdout.write(self.style.NOTICE(f"Branch exists: {branch.name}"))

        if demo_sub_created:
            self.stdout.write(self.style.SUCCESS(f"SubOrganisation created: {demo_suborg.name}"))
        else:
            self.stdout.write(self.style.NOTICE(f"SubOrganisation exists: {demo_suborg.name}"))

        if demo_branch_created:
            self.stdout.write(self.style.SUCCESS(f"Branch created: {demo_branch.name}"))
        else:
            self.stdout.write(self.style.NOTICE(f"Branch exists: {demo_branch.name}"))
