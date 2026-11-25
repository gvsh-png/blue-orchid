# source-syoboi

Syoboi Calendar's Japanese TV listings as a schedule source. Imports `core`, `domain` and `effect`.
Follow its bot rules (https://docs.cal.syoboi.jp/rule/bot/): API only, one request at a time a second apart, our
User-Agent with a contact page. First broadcasts of new episodes become `raw` releases in `JP`; reruns are left out.
