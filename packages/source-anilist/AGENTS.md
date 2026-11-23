# source-anilist

The AniList schedule source. Imports `core`, `domain` and `effect`.
It turns AniList's airing schedule into shows and `raw` releases in `JP`, and decodes every answer with a Schema.
AniList allows about 30 to 90 requests a minute; one sync asks for about one page per 50 releases.
