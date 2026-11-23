# source-anilist

AniList as the catalog source. Imports `core`, `domain` and `effect`.
It reads one catalog slice per run as pages of 50 shows, and decodes every answer with a Schema.
AniList allows about 30 to 90 requests a minute.
