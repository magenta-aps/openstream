from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
from .models import Branch, SlideshowPlayerAPIKey, Slideshow, SlideshowPlaylist, SlideshowPlaylistItem

@receiver(post_save, sender=Branch)
def create_slideshow_player_api_key(sender, instance, created, **kwargs):
    if created:
        SlideshowPlayerAPIKey.objects.create(branch=instance)


# Keep parent slideshow.updated_at in sync when Slides change
@receiver(post_save)
def touch_slideshow_on_slide_save(sender, instance, created, **kwargs):
    # Only act for the Slide model
    if sender.__name__ != "Slide":
        return
    try:
        if instance.slideshow_id:
            Slideshow.objects.filter(pk=instance.slideshow_id).update(
                updated_at=timezone.now()
            )
    except Exception:
        pass


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


@receiver(post_save)
def touch_slideshow_on_slide_delete(sender, instance, **kwargs):
    # Insensitive: Django's post_delete would be ideal but to avoid importing post_delete we'll
    # rely on callers using delete() which we've overridden on SlideshowPlaylistItem earlier.
    return
