# Gallery and Identity / Direction

DIET SYS routes `/diet/gallery` and `/diet/identity` share the existing sidebar
and global tabs. Phase 1 records, goals, and settings remain independent.

Gallery contains user-named sections, columns, and IMAGE/TEXT blocks. A new
section starts with one editable column; deleting its last column is rejected.
Deleting a section or column also deletes its contained blocks. Drag handles
reorder sections, columns within their section, and blocks; blocks may move
between any columns, including across sections. Drops persist immediately.
Titles and plain multiline text use explicit save dialogs.

Identity holds at most three blocks, enforced under an owner-scoped transaction
lock. Desktop uses exactly as many equal columns as actual blocks, with no add
tile or placeholder. The header contains the add action; narrow screens stack
the blocks. Identity contains declarations and direction, not weight goals.

## Persistence and API

Flyway V39 adds `diet_gallery_sections`, `diet_gallery_columns`,
`diet_gallery_blocks`, and `diet_identity_blocks`. Owner-scoped foreign keys
protect the Gallery hierarchy. RLS is enabled; access is through the backend's
authenticated current-user provider. Hibernate remains `ddl-auto=validate`.

`GET /api/diet/board` returns sections, columns, blocks, and identities.
`PUT /api/diet/board/{sections|columns|blocks|identities}/{id}` saves content.
The server preserves existing order and appends new content.
`PUT /api/diet/board/order/{kind}` takes `{parentId, ids}`: an exact permutation
of siblings, with null parent for sections/identities. Stale lists are rejected.
`PUT /api/diet/board/blocks/{id}/move` takes `{columnId, index}` and moves the
block atomically. `DELETE /api/diet/board/{kind}/{id}` deletes owned content.

`POST /api/diet/board/images` accepts `{columnId, data}` (base64 raster),
atomically storing the image and its block. `GET /api/diet/board/images/{id}`
returns authenticated, non-cacheable image bytes. Images reuse `journal_media`
and the shared RasterMedia/encodeImage pipeline, with a new `diet_owner_id`
domain discriminator; no NOTE SYS records are created. Limit: 10 MB / 40 MP,
PNG/JPEG/GIF, with WebP converted in the browser. Deleting board content removes
unreferenced DIET-owned media only.
