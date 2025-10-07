from app.models import SlideTemplate
print("Model fields:", [f.name for f in SlideTemplate._meta.fields])
print("Has aspect_ratio field:", hasattr(SlideTemplate, 'aspect_ratio'))
print("Has accepted_aspect_ratios field:", hasattr(SlideTemplate, 'accepted_aspect_ratios'))
