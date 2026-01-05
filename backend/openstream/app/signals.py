import threading
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
from django.contrib.auth.models import User
from .models import (
    Branch,
    SlideshowPlayerAPIKey,
    Slideshow,
    SlideshowPlaylist,
    SlideshowPlaylistItem,
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
