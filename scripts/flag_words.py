"""Flag words in a converted book that are probably OCR errors, to focus the language review.

    python3 scripts/flag_words.py <book id> [more book ids for a bigger word list] > flags.json

For each page index: [{word, why, suggestion?}]. Signals:
  rare-variant  a word seen once whose one-letter variant is common in the text (likely misread letter)
  split         two neighbouring pieces that form a common word when joined
  mixed         Latin letters or digits inside an Ethiopic word (ordinals like 19ኛው are fine)
  long          an unusually long word (often two words run together)
  lone-letter   a single Ethiopic letter standing alone (often a misread punctuation mark)
  odd-mark      characters that do not belong in Amharic text (* • ✓ # | etc.)
"""
import json, os, re, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ETH = re.compile(r'^[ሀ-፿]+$')
WORD = re.compile(r'[ሀ-፿\w]+')
ALLOWED_LONE = set('ዓምትቁ')                      # parts of abbreviations like ዓ.ም. / ቁ.
# numbers with Amharic prepositions or ordinal endings: በ1967, ከ25,206, 1ኛ/, በ16ኛው, ከ48—98
NUMBER_WORD = re.compile(r'^[በከለየእስንደ]{0,3}\d[\d,.—–-]*(ኛ|ኛው|ኛዋ|ኛይቱ|ኞቹ|ዎቹ|ቹ|ም|ና|ን)?/?$')
LETTERS = [chr(c) for c in range(0x1200, 0x135B)]

def variants(w):
    for i in range(len(w) - 1):                      # not the last letter: its vowel is usually grammar (ቱ/ት, ሉ/ል)
        base = (ord(w[i]) - 0x1200) // 8 * 8 + 0x1200
        for c in range(base, base + 8):              # same consonant, other vowel orders (the most common misread)
            if chr(c) != w[i]: yield w[:i] + chr(c) + w[i + 1:]

def main():
    ids = [int(x) for x in sys.argv[1:]]
    books = [json.load(open(os.path.join(ROOT, f'data/text/{i}.json'))) for i in ids]
    freq = Counter(w for d in books for p in d['pages'] for b in p['blocks'] for w in WORD.findall(b['x']) if ETH.match(w))
    out = {}
    for i, p in enumerate(books[0]['pages']):
        flags = []
        for b in p['blocks']:
            if b['t'] == 'toc': continue
            toks = b['x'].split()
            for k, t in enumerate(toks):
                w = t.strip('.,;:!?«»“”"\'()[]።፣፤፥፦፡')
                if not w: continue
                if re.search(r'[*•✓#|▪★✗~^]', t): flags.append({'word': t, 'why': 'odd-mark'})
                if re.search(r'[ሀ-፿]', w) and re.search(r'[A-Za-z]', w): flags.append({'word': w, 'why': 'mixed'})
                elif re.search(r'[\u1200-\u137F]\d|\d[\u1200-\u137F]', w) and not NUMBER_WORD.match(t.strip('.,;:!?«»“”"\'()።፣፤፥፦፡')):
                    flags.append({'word': w, 'why': 'mixed'})
                if not ETH.match(w): continue
                if len(w) == 1 and w not in ALLOWED_LONE: flags.append({'word': w, 'why': 'lone-letter'})
                if len(w) >= 15: flags.append({'word': w, 'why': 'long'})
                if freq[w] == 1 and len(w) >= 3:
                    best = max(variants(w), key=lambda v: freq[v], default=None)
                    if best and freq[best] >= 3: flags.append({'word': w, 'why': 'rare-variant', 'suggestion': best})
                if k + 1 < len(toks):
                    n = toks[k + 1].strip('.,;:!?«»“”"\'()።፣፤፥፦፡')
                    if ETH.match(n) and freq[w + n] >= 2 and freq[w + n] > min(freq[w], freq[n]):
                        flags.append({'word': f'{w} {n}', 'why': 'split', 'suggestion': w + n, 'note': 'hint only: the author may write it apart'})
        if flags: out[f'{i:03d}'] = flags
    json.dump(out, sys.stdout, ensure_ascii=False, indent=0)
    print(f'{sum(len(v) for v in out.values())} flags on {len(out)} pages', file=sys.stderr)

if __name__ == '__main__':
    main()
