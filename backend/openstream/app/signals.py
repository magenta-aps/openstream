# SPDX-FileCopyrightText: 2025 Magenta ApS <https://magenta.dk>
# SPDX-License-Identifier: AGPL-3.0-only


import threading
from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
from django.contrib.auth.models import User
import requests
from .models import (
    Branch,
    DisplayWebsite,
    DisplayWebsiteGroup,
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
@receiver(post_save, sender=Slideshow)
@receiver(post_save, sender=SlideshowPlaylist)
@receiver(post_save, sender=ScheduledContent)
@receiver(post_save, sender=RecurringScheduledContent)
@receiver(post_save, sender=DisplayWebsiteGroup)
@receiver(post_save, sender=DisplayWebsite)
def notify_express_of_change(sender, instance, **kwargs):
    express_refresh_url = getattr(settings, "EXPRESS_REFRESH_URL", None)

    if not express_refresh_url:
        return

    try:
        # Tell Express to refresh whenever relevant content changes.
        requests.get(
            express_refresh_url,
            params={"reason": sender.__name__, "object_id": instance.pk},
            timeout=2,
        )
    except Exception as e:
        print(f"Failed to notify Express: {e}")