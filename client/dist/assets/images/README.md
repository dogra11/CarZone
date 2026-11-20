# CarZone images

All images here are **original artwork generated in code** by `scripts/generate_images.py`
and `scripts/store_images.py` (Python + Pillow + NumPy). No stock photos, no real brand
logos - car makes appear only as plain text in the UI, and accessory brands are fictional.

## Folder structure

```
images/
├── hero.jpg                 Landing hero (1920 x 1080)
├── about.jpg                "Why CarZone" section
├── dashboard-banner.jpg     Customer dashboard banner
├── auth-side.jpg            Login / register side panel
├── map-fallback.jpg         Shown when the OpenStreetMap embed cannot load (offline)
├── store-hero.jpg           Shop page hero (1920 x 800)
├── promo-care.jpg           Promo banner - car care
├── promo-tech.jpg           Promo banner - electronics
├── logo.svg                 Wordmark (shield mark + "CarZone") for dark backgrounds
├── logo-light.svg           Wordmark for white paper (print / invoices)
├── logo-mark.svg            Icon only (navbar, footer, admin sidebar, invoices)
├── favicon.svg              Browser tab icon
├── fallback.svg             Shown automatically when ANY image fails to load
├── avatar-fallback.svg      Fallback for missing profile pictures
├── services/<slug>.jpg      One per wash service (1200 x 800)
├── gallery/gallery-N.jpg    Landing gallery (1200 x 900)
├── avatars/                 Demo user avatars (256 x 256)
├── categories/<slug>.jpg    One banner per shop category (1200 x 600)
└── products/<slug>-1.jpg    Product hero shot (800 x 600)
    products/<slug>-2.jpg    Product detail shot (800 x 600)
```

## Replacing images with real photos

Keep the **same file name** and drop your photo in - no code changes needed. For a new
product, put the photo in `products/` and enter its path (e.g.
`/assets/images/products/my-item-1.jpg`) in Admin > Products. If a file is missing, the
`<Img>` component swaps in `fallback.svg`, so the layout never breaks.

## Regenerating

```
pip install pillow numpy
python scripts/generate_images.py          # everything (about 3-4 minutes)
python scripts/generate_images.py --store  # logos + store images only
```
Then run `npm run build:client` so the files are copied into `client/dist`.
