# Approved Android UI mapping — 2026-11-17 KST

Binding references: supplied HTML and Feed/Composer PNGs. Presentation bezel, fake status/gesture chrome, sample-photo generation and desktop drop target are excluded from app content. System bars and Photo Picker are native Android. No WebView.

| Approved interaction | Native implementation | Shared data / behavior |
| --- | --- | --- |
| Top profile / LOG. / settings | Fixed 53dp header; profile bottom sheet; minimal settings sheet | state + active profile API, saved server preference |
| Integrated profile/feed | ProfileHeader within scrollable LazyColumn, name/handle/avatar/bio, real counts | state profiles; authenticated private avatar; feed stats |
| Bottom 내 피드 / large + / 검색 | Exactly two Navigation Compose destinations; central dark rounded action | + opens fullscreen native Dialog route; no extra tabs |
| 프로필 편집 / 추가 | Native bottom sheet, explicit name/handle/bio fields, limits, existing avatar preserved | UUID create; revision update; handle is user supplied, never derived |
| 인사이트 보기 | Minimal counts sheet | Actual profile-wide posts/media/replies supplied by feed, not loaded-page estimates |
| 스레드 / 미디어 | Two selectable subtabs; native image grid | Chronological paged posts; grid keeps post + image index for viewer |
| Quick compose | Avatar + hint + round plus | Same Editor state as bottom + |
| Post menu/edit/delete | Native overflow; fullscreen edit with persisted images; confirmed delete | Server ownership, expected revision, no cancel mutation |
| Phone image gallery | HorizontalPager, one image at a time, position and bounded arrows | Server attachment order, private authenticated bytes; disk caching disabled |
| Fullscreen viewer | Black native fullscreen dialog; aspect fit; swipe/arrows/back | Same ordered private media IDs |
| New/edit composer | 취소 / 새 기록 or 기록 수정 / 게시 or 저장; profile; multiline body; ordered horizontal previews | Stable UUID create; revision edit; uncertain responses retry immutable payload |
| Multi-photo pick | System PickMultipleVisualMedia; repeated selection; no storage permission | Server-advertised limit (default 20), PNG/JPEG/WebP, 18MiB, image-only supported |
| Thumbnail reorder/remove/retry | Sequence numbers, left/right, remove and honest per-file phases/errors | At most two upload workers; reservation → authenticated bytes → complete; READY immutable |
| Unsent input | Owner/profile/post-scoped encrypted local draft; interruption restore and explicit cancel choices | URI references only, no photo bytes in preferences; authoritative content remains server-only |
| Search | Heading, Korean placeholder, clear, 전체 기록 / 사진 포함, debounced and paged results | Profile-scoped q including real replies; stale results canceled; jump to feed |
| Comments | Bottom sheet with pagination, create/edit/delete | Existing owner-reply API; stable create UUID; revision edits/deletes |
| Refresh/errors/empty state | PullToRefreshBox, progress, retry dialogs, explicit load-more, keyed scroll | Existing bounded offset contract; foreground resume/pull refresh retrieves web changes |

Shared backend addition: optional `chronological=true` on GET profile posts, because existing web sorts pinned first. Default remains unchanged. No migration, database fork, new storage, auth change or unrelated POS navigation.

Platform adaptations: system UI replaces drawn chrome; system picker replaces desktop drop and sample actions; real fallback avatar replaces demo gradient; explicit handle field follows canonical backend validation. Physical Z Flip 6 and TalkBack validation are recorded separately from emulator evidence in QA.
