# Global Fonts Manifest

Place reusable, cross-organisation webfonts in this folder so they can be referenced when `?special_save=true` is active.

## Manifest format

Update `fonts.json` with entries like:

```
[
  {
    "name": "Acme Sans",
    "path": "acme-sans/AcmeSans-Regular.woff2",
    "weight": "400",
    "style": "normal"
  }
]
```

- `name` is the font-family name stored on slide elements.
- `path`/`url`/`font_url` can be a relative path within `public/global_fonts` or an absolute URL. Relative paths are automatically prefixed with `/global_fonts/`.
- `weight` and `style` are optional metadata used for the injected `@font-face` rule.

Store the actual font files alongside the manifest (e.g. `public/global_fonts/acme-sans/AcmeSans-Regular.woff2`).
