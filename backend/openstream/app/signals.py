# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only


import threading
from django.conf import settings
from django.db.models.signals import m2m_changed, post_save, post_delete, pre_delete
from django.dispatch import receiver
from django.utils import timezone
from django.contrib.auth.models import User
import requests
from .models import (
    Branch,
    DisplayWebsite,
    DisplayWebsiteGroup,
    EmergencySlideshow,
    RecurringScheduledContent,
    ScheduledContent,
    Slideshow,
    SlideshowPlayerAPIKey,
    SlideshowPlaylist,
    UserExtended,
    Document,
)
from .utils import convert_document_pdf


@receiver(post_save, sender=Branch)
def create_slideshow_player_api_key(sender, instance, created, **kwargs):
    if created:
        SlideshowPlayerAPIKey.objects.create(branch=instance)


@receiver(post_save)
def touch_playlist_on_item_save(sender, instance, created, **kwargs):
    # Also ensure playlist items saved via API/update touch playlist (fallback)
    if sender.__name__ != "SlideshowPlaylistItem":
        return
    try:
        if instance.slideshow_playlist_id:
            SlideshowPlaylist.objects.filter(pk=instance.slideshow_playlist_id).update(
                updated_at=timezone.now()
            )
    except Exception:
        pass


@receiver(post_save, sender=User)
def create_user_extended(sender, instance, created, **kwargs):
    if created:
        UserExtended.objects.create(user=instance)


@receiver(post_save, sender=Document)
def process_document_pdf(sender, instance, created, **kwargs):
    if instance.processing_status == Document.ProcessingStatus.PENDING:
        # Run conversion in a background thread
        thread = threading.Thread(
            target=convert_document_pdf, args=(instance.pk,), daemon=True
        )
        thread.start()


# List all models that affect the final "Active Content"
@receiver(pre_delete, sender=EmergencySlideshow)
def cache_emergency_slideshow_groups(sender, instance, **kwargs):
    """Persist related group IDs for post-delete signals."""
    instance._cached_display_group_ids = list(
        instance.display_website_groups.values_list("id", flat=True)
    )


@receiver(post_save, sender=Slideshow)
@receiver(post_save, sender=SlideshowPlaylist)
@receiver(post_save, sender=ScheduledContent)
@receiver(post_save, sender=RecurringScheduledContent)
@receiver(post_save, sender=DisplayWebsiteGroup)
@receiver(post_save, sender=DisplayWebsite)
@receiver(post_save, sender=EmergencySlideshow)
@receiver(post_delete, sender=EmergencySlideshow)
def notify_express_of_change(sender, instance, **kwargs):
    express_refresh_url = getattr(settings, "EXPRESS_REFRESH_URL", None)

    if not express_refresh_url:
        return

    params = {"reason": sender.__name__, "object_id": instance.pk}

    if sender is EmergencySlideshow:
        # Include extra context so Express can scope emergency refreshes precisely
        params["slideshow_id"] = instance.slideshow_id
        group_ids = getattr(instance, "_cached_display_group_ids", None)
        if group_ids is None:
            group_ids = list(
                instance.display_website_groups.values_list("id", flat=True)
            )
        if group_ids:
            params["group_ids"] = ",".join(str(group_id) for group_id in group_ids)

    if sender is DisplayWebsite:
        params["displaywebsite_id"] = instance.pk
        if instance.branch_id: 
            params["branch_id"] = instance.branch_id

    try:
        # Tell Express to refresh whenever relevant content changes.
        requests.get(
            express_refresh_url,
            params=params,
            timeout=2,
        )
    except Exception as e:
        print(f"Failed to notify Express: {e}")


@receiver(m2m_changed, sender=EmergencySlideshow.display_website_groups.through)
def notify_express_on_emergency_groups_change(sender, instance, action, **kwargs):
    if action not in {"post_add", "post_remove", "post_clear"} or instance is None:
        return

    notify_express_of_change(sender=EmergencySlideshow, instance=instance)
