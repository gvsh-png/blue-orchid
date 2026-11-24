# source-anilist

AniList as the catalog source and a schedule source. Imports `core`, `domain` and `effect`.
It reads one catalog slice per run, and every airing or announced show's coming broadcasts per sync, as pages of
50 shows, and decodes every answer with a Schema.
AniList allows about 30 to 90 requests a minute.
