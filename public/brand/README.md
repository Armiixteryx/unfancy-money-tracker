# Browser brand assets

These checked-in outputs are copied into Expo's static export without an extra
build dependency. Regenerate from the approved kit with:

```sh
python3 scripts/build-web-brand-assets.py
```

Regeneration needs `rsvg-convert`; normal app builds do not. Production images
are byte-for-byte copies of the approved exports. Development images retain the
approved DEV ribbon, with a navy-padded maskable icon that keeps all artwork
inside the central 80% safe circle. HTML selects one complete set using the
same `EXPO_PUBLIC_ENV=prod` gate as native launcher icons.

The manifest supplies install metadata only; there is no service worker,
background synchronization, or offline document cache.
