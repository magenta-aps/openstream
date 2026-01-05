from datetime import datetime, timedelta
from django.db.models import Q
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.apps import apps

def make_aware_if_needed(dt):
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, timezone.get_current_timezone())
    return dt

def _check_overlap(start1, end1, start2, end2):
    """Check if two time ranges overlap."""
    return start1 < end2 and end1 > start2

def validate_scheduled_content(
    start_time,
    end_time,
    display_website_group,
    combine_with_default,
    instance_id=None
):
    """
    Validates a ScheduledContent instance (one-time event).
    """
    ScheduledContent = apps.get_model('app', 'ScheduledContent')
    RecurringScheduledContent = apps.get_model('app', 'RecurringScheduledContent')

    if not start_time or not end_time:
        return

    start_time = make_aware_if_needed(start_time)
    end_time = make_aware_if_needed(end_time)

    # 1. Check against other ScheduledContent
    # If this is an override (combine_with_default=False), it conflicts with ANY overlapping content.
    # If it's not an override, it only conflicts with overlapping OVERRIDES.
    
    conflicting_scheduled = ScheduledContent.objects.filter(
        display_website_group=display_website_group,
        start_time__lt=end_time,
        end_time__gt=start_time,
    )
    
    if instance_id:
        conflicting_scheduled = conflicting_scheduled.exclude(pk=instance_id)

    if not combine_with_default:
        # We are an override, so we conflict with everything
        if conflicting_scheduled.exists():
            conflict = conflicting_scheduled.first()
            content_name = conflict.slideshow or conflict.playlist
            raise ValidationError(
                f"Cannot schedule an override as other content is already present: '{content_name}'."
            )
    else:
        # We are not an override, so we only conflict with existing overrides
        overrides = conflicting_scheduled.filter(combine_with_default=False)
        if overrides.exists():
            conflict = overrides.first()
            content_name = conflict.slideshow or conflict.playlist
            raise ValidationError(
                f"Cannot schedule content as an override is already present: '{content_name}'."
            )

    # 2. Check against RecurringScheduledContent
    # We need to find recurring events that are active during [start_time, end_time]
    # and match the weekday and time.
    
    # Filter recurring events that are active during the date range of the scheduled content
    relevant_recurring = RecurringScheduledContent.objects.filter(
        display_website_group=display_website_group,
        active_from__lte=end_time.date(),
    ).filter(
        Q(active_until__isnull=True) | Q(active_until__gte=start_time.date())
    )

    if not combine_with_default:
        # We are an override, conflict with ANY recurring content in the slot
        pass
    else:
        # We are not an override, conflict only with recurring OVERRIDES
        relevant_recurring = relevant_recurring.filter(combine_with_default=False)

    # Now iterate through the relevant recurring events and check for precise overlap
    # Since start_time and end_time can span multiple days, we iterate through the days of the scheduled content
    
    current_date = start_time.date()
    end_date = end_time.date()
    
    while current_date <= end_date:
        weekday = current_date.weekday()
        
        # Filter recurring events for this weekday
        days_recurring = [r for r in relevant_recurring if r.weekday == weekday]
        
        for recurring in days_recurring:
            # Construct the specific time range for this recurring event on this day
            r_start = make_aware_if_needed(datetime.combine(current_date, recurring.start_time))
            r_end = make_aware_if_needed(datetime.combine(current_date, recurring.end_time))
            
            if _check_overlap(start_time, end_time, r_start, r_end):
                content_name = recurring.slideshow or recurring.playlist
                msg = f"Cannot schedule content as a recurring override is already present: '{content_name}'." if recurring.combine_with_default is False else f"Cannot schedule an override as other recurring content is already present: '{content_name}'."
                # Adjust message based on who is the override
                if not combine_with_default:
                     raise ValidationError(f"Cannot schedule an override as other recurring content is already present: '{content_name}'.")
                else:
                     raise ValidationError(f"Cannot schedule content as a recurring override is already present: '{content_name}'.")

        current_date += timedelta(days=1)


def validate_recurring_content(
    weekday,
    start_time,
    end_time,
    active_from,
    active_until,
    display_website_group,
    combine_with_default,
    instance_id=None
):
    """
    Validates a RecurringScheduledContent instance.
    """
    ScheduledContent = apps.get_model('app', 'ScheduledContent')
    RecurringScheduledContent = apps.get_model('app', 'RecurringScheduledContent')

    if not active_until:
        # If no end date, check 5 years into the future
        check_until = active_from + timedelta(days=365 * 5)
    else:
        check_until = active_until

    # 1. Check against other RecurringScheduledContent
    conflicting_recurring = RecurringScheduledContent.objects.filter(
        display_website_group=display_website_group,
        weekday=weekday,
        start_time__lt=end_time,
        end_time__gt=start_time,
        active_from__lte=check_until,
    ).filter(
        Q(active_until__isnull=True) | Q(active_until__gte=active_from)
    )

    if instance_id:
        conflicting_recurring = conflicting_recurring.exclude(pk=instance_id)

    if not combine_with_default:
        # We are an override, conflict with ANY overlapping recurring
        if conflicting_recurring.exists():
            conflict = conflicting_recurring.first()
            content_name = conflict.slideshow or conflict.playlist
            raise ValidationError(
                f"Cannot schedule an override as other recurring content is already present: '{content_name}'."
            )
    else:
        # We are not an override, conflict only with recurring OVERRIDES
        overrides = conflicting_recurring.filter(combine_with_default=False)
        if overrides.exists():
            conflict = overrides.first()
            content_name = conflict.slideshow or conflict.playlist
            raise ValidationError(
                f"Cannot schedule content as a recurring override is already present: '{content_name}'."
            )

    # 2. Check against ScheduledContent
    # Optimization: Fetch all potentially conflicting ScheduledContent in one query
    # instead of iterating through every day.
    
    # We need ScheduledContent that:
    # - Is in the same group
    # - Overlaps with the date range [active_from, check_until]
    # - If we are override: ANY content. If we are not: only OVERRIDE content.
    
    potential_conflicts = ScheduledContent.objects.filter(
        display_website_group=display_website_group,
        start_time__lt=make_aware_if_needed(datetime.combine(check_until, datetime.max.time())),
        end_time__gt=make_aware_if_needed(datetime.combine(active_from, datetime.min.time())),
    )
    
    if instance_id:
        # This is tricky because we are validating a RecurringContent, but checking against ScheduledContent.
        # instance_id refers to RecurringContent, so we don't exclude anything from ScheduledContent.
        pass

    if combine_with_default:
        # We are not an override, so we only care about ScheduledContent that IS an override
        potential_conflicts = potential_conflicts.filter(combine_with_default=False)
    
    # Now iterate through the potential conflicts and check if they actually hit the weekday and time
    for sc in potential_conflicts:
        # Check if this ScheduledContent overlaps with any occurrence of the recurring event
        
        # Intersection of date ranges
        sc_start_date = sc.start_time.date()
        sc_end_date = sc.end_time.date()
        
        overlap_start_date = max(active_from, sc_start_date)
        overlap_end_date = min(check_until, sc_end_date)
        
        if overlap_start_date > overlap_end_date:
            continue
            
        # Iterate through days in the intersection to find if our weekday is present
        # Optimization: jump to the first occurrence of 'weekday'
        
        days_until_weekday = (weekday - overlap_start_date.weekday() + 7) % 7
        first_occurrence = overlap_start_date + timedelta(days=days_until_weekday)
        
        if first_occurrence > overlap_end_date:
            continue
            
        # If we found at least one day that is the correct weekday within the overlap,
        # we need to check the time overlap on that day.
        # Since the recurring event is the same time every day, and ScheduledContent might span multiple days,
        # we need to be careful.
        
        # We iterate through all occurrences in the overlap range
        current_occurrence = first_occurrence
        while current_occurrence <= overlap_end_date:
            # Check time overlap on this specific day
            
            # Recurring time on this day
            r_start = make_aware_if_needed(datetime.combine(current_occurrence, start_time))
            r_end = make_aware_if_needed(datetime.combine(current_occurrence, end_time))
            
            # ScheduledContent time is sc.start_time to sc.end_time
            # It definitely overlaps if we are here, because sc spans this whole day (or part of it)
            # But we need to check if the *times* overlap.
            
            if _check_overlap(sc.start_time, sc.end_time, r_start, r_end):
                content_name = sc.slideshow or sc.playlist
                if not combine_with_default:
                     raise ValidationError(f"Cannot schedule an override as other content is already present: '{content_name}' on {current_occurrence}.")
                else:
                     raise ValidationError(f"Cannot schedule content as an override is already present: '{content_name}' on {current_occurrence}.")
            
            current_occurrence += timedelta(days=7)
