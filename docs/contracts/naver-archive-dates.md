# Naver owner archive dates and list discovery

The reader defaults to newest first (`order=desc`). The API retains its existing
default for backward compatibility. Both directions order by publication date,
then ID, with missing dates last. An ID tie-break is never a publication date.

`GET /api/naver-archive/posts` accepts optional `dateState=all|known|unknown`.
Omitting it means `all`. Unknown values are rejected. The cursor is bound to this
filter just like the existing search/owner/archive/date filters.

The response includes `unknownDates`: the number of undated posts matching the
owner, search, category, visibility, provenance, fidelity, read state and archive
filters, before date bounds, dateState and cursor. `total` retains its existing
meaning: matching rows after all filters, before cursor pagination. Counts never
include another owner's data. Date ranges still exclude null dates.

The reader always calls out matching undated posts even when the date range has
zero matches. The one-click undated view clears date bounds, preserves the other
filters, and uses the normal server pagination. It explicitly says that its order
is not publication order. Selecting a date bound returns to all date states.
The visible/total count and next-page button distinguish 50 loaded rows from the
whole archive. No artificial dates are assigned to make a post sort first.

Date restoration requires source evidence and explicit owner intent. For the
2026-11-21 archive, the owner separately approved using backup folder dates for
350 posts in the chat “네이버블로그 작업 진행”. This is a day-level, owner-approved
folder-date basis at KST midnight, not proof of original publication time. The
approval, source mapping and write/readback receipts remain the provenance of
that correction. This UI change must not repeat concurrent restoration writes.
An HTML `ugc-backup-stamp` timestamp is not a publication date.
