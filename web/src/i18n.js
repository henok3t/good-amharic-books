export const GROUPS = {
  'Scripture': ['Scripture', 'መጽሐፍ ቅዱስ', '📖'],
  'Old Testament Studies': ['Old Testament Studies', 'የብሉይ ኪዳን ጥናቶች', '📜'],
  'New Testament Studies': ['New Testament Studies', 'የአዲስ ኪዳን ጥናቶች', '✝️'],
  'Doctrine': ['Doctrine', 'አስተምህሮ', '🏛️'],
  'Apologetics': ['Apologetics', 'የእምነት ጥብቅና', '🛡️'],
  'Prophecy': ['Prophecy', 'ትንቢት', '🔭'],
  'Christian Life': ['Christian Life', 'የክርስቲያን ሕይወት', '🌱'],
  'Marriage and the Family': ['Marriage & Family', 'ትዳርና ቤተሰብ', '🏠'],
  'Teachers Helps': ["Teachers' Helps", 'ለአስተማሪዎች መርጃ', '🧑‍🏫'],
  'Church History': ['Church History', 'የቤተ ክርስቲያን ታሪክ', '⛪'],
  'History': ['History', 'ታሪክ', '🏺'],
  'E. O. C. Books': ['Ethiopian Orthodox Church', 'የኢትዮጵያ ኦርቶዶክስ ቤተ ክርስቲያን', '☦️'],
  'Islam': ['Islam', 'እስልምና', '🌙'],
  'Biography': ['Biography', 'የሕይወት ታሪክ', '👤'],
  'Reference': ['Reference', 'ማጣቀሻ', '📚'],
  'Tracts': ['Tracts', 'በራሪ ጽሑፎች', '📄'],
  'Children': ['Children', 'የልጆች', '🧸'],
  'Other': ['Other', 'ሌሎች', '🗂️'],
  'Fiction': ['Fiction', 'ልብ ወለድ', '🪶'],
  'Audio Books': ['Audio Books', 'የድምፅ መጻሕፍት', '🎧'],
  'Books In Tigrinya': ['Books in Tigrinya', 'የትግርኛ መጻሕፍት', '🗣️'],
  'Other Ethiopian Languages': ['Other Ethiopian Languages', 'ሌሎች የኢትዮጵያ ቋንቋዎች', '🌍'],
  'Articles': ['Articles', 'ጽሑፎች', '📰'],
  'Magazines': ['Magazines', 'መጽሔቶች', '🗞️'],
};

export const LANGS = {
  am: ['Amharic', 'አማርኛ'], ti: ['Tigrinya', 'ትግርኛ'], en: ['English', 'እንግሊዝኛ'], el: ['Greek', 'ግሪክኛ'],
  gez: ["Ge'ez", 'ግዕዝ'], om: ['Oromo', 'ኦሮምኛ'], hdy: ['Hadiyya', 'ሀዲይኛ'], wal: ['Wolaytta', 'ወላይትኛ'],
  so: ['Somali', 'ሶማሊኛ'], har: ['Harari', 'ሐረሪኛ'], ktb: ['Kambaata', 'ከምባትኛ'], kbr: ['Kafa', 'ካፊኛ'],
  kxc: ['Konso', 'ኮንሶኛ'], aiw: ['Aari', 'አሪኛ'], sgw: ['Gurage', 'ጉራጊኛ'], he: ['Hebrew', 'ዕብራይስጥ'],
};

export function groupName(g, lang) { const e = GROUPS[g]; return e ? e[lang === 'am' ? 1 : 0] : g; }
export function groupIcon(g) { return GROUPS[g]?.[2] || '📘'; }
export function langName(l, lang) { const e = LANGS[l]; return e ? e[lang === 'am' ? 1 : 0] : l; }

const T = {
  siteName: ['Good Amharic Books', 'መልካም የአማርኛ መጻሕፍት'],
  home: ['Home', 'መነሻ'], reading: ['Reading', 'ንባብ'],
  readable: ['📖 Text', '📖 ጽሑፍ'], readableText: ['Readable text', 'የሚነበብ ጽሑፍ'],
  readNow: ['Read the book', 'መጽሐፉን ያንብቡ'], readEn: ['Read in English', 'በእንግሊዝኛ ያንብቡ'], enBadge: ['EN', 'EN'],
  enNote: ['English translation available: switch between Amharic, English or both in the reader.', 'የእንግሊዝኛ ትርጉም አለ፤ በአንባቢው ውስጥ አማርኛ፣ እንግሊዝኛ ወይም ሁለቱንም መምረጥ ይችላሉ።'],
  pdfTextEn: ['PDF · English translation', 'PDF · የእንግሊዝኛ ትርጉም'], continueAt: ['Continue reading · page {p} ({pct}%)', 'ንባብ ይቀጥሉ · ገጽ {p} ({pct}%)'],
  readNote: ['Converted to text: adjustable size, themes, search and offline reading.', 'ወደ ጽሑፍ የተቀየረ፦ የፊደል መጠን፣ ገጽታ፣ ፍለጋና ያለ ኢንተርኔት ንባብ።'],
  originalScans: ['Original scans (PDF)', 'ዋናዎቹ የተቃኙ ገጾች (PDF)'],
  continueReading: ['Continue reading', 'ንባብ ይቀጥሉ'], readableBooks: ['Books you can read as text', 'እንደ ጽሑፍ የሚነበቡ መጻሕፍት'],
  noReading: ['Books you open in the reader will appear here.', 'በንባብ ገጹ የከፈቷቸው መጻሕፍት እዚህ ይታያሉ።'],
  readableSoon: ['More books will become readable as text once the full conversion runs.', 'ሙሉው ለውጥ ሲካሄድ ተጨማሪ መጻሕፍት እንደ ጽሑፍ ይነበባሉ።'],
  pageOf: ['Page {p} · {pct}%', 'ገጽ {p} · {pct}%'], notStarted: ['Not started', 'ገና አልተጀመረም'], offlineReady: ['Available offline', 'ያለ ኢንተርኔት ይገኛል'],
  textUnavailable: ['This book\u2019s text couldn\u2019t be loaded. Check your connection.', 'የመጽሐፉ ጽሑፍ ሊጫን አልቻለም። ግንኙነትዎን ያረጋግጡ።'],
  install: ['Install app', 'መተግበሪያውን ጫን'],
  pdfText: ['PDF · text edition', 'PDF · የጽሑፍ እትም'], pdfScan: ['PDF · original scans', 'PDF · ዋናው ቅኝት'],
  pdfNote2: ['The text edition is newly typeset for reading and printing; the scan PDF combines the original pages into one file.', 'የጽሑፍ እትሙ ለንባብና ለሕትመት በአዲስ መልክ የተዘጋጀ ነው፤ የቅኝቱ PDF ዋናዎቹን ገጾች በአንድ ፋይል ያጣምራል።'],
  iosInstall: ['To install on iPhone or iPad: tap Share, then “Add to Home Screen”.', 'በiPhone ወይም iPad ላይ ለመጫን፦ Share ን ይንኩ፣ ከዚያ “Add to Home Screen” ን ይምረጡ።'], library: ['Library', 'ቤተ መጻሕፍት'], about: ['About', 'ስለ እኛ'],
  heroTitle: ['A free library of Amharic Christian books', 'ነጻ የአማርኛ ክርስቲያናዊ መጻሕፍት ቤተ መጻሕፍት'],
  heroSub: ['{n} books in Amharic, Tigrinya and other Ethiopian languages — read online or download.',
    'በአማርኛ፣ በትግርኛና በሌሎች የኢትዮጵያ ቋንቋዎች {n} መጻሕፍት — በመስመር ላይ ያንብቡ ወይም ያውርዱ።'],
  searchPlaceholder: ['Search in Amharic or English — e.g. ዮሐንስ, Yohannes, Derek Prince',
    'በአማርኛ ወይም በእንግሊዝኛ ይፈልጉ — ለምሳሌ ዮሐንስ፣ Yohannes'],
  search: ['Search', 'ፈልግ'],
  books: ['books', 'መጻሕፍት'], categories: ['Categories', 'ምድቦች'], languages: ['Languages', 'ቋንቋዎች'],
  browse: ['Browse by category', 'በምድብ ይመልከቱ'], allBooks: ['All books', 'ሁሉም መጻሕፍት'],
  results: ['{n} results', '{n} ውጤቶች'], noResults: ['No books match your search.', 'ፍለጋዎን የሚመስል መጽሐፍ አልተገኘም።'],
  allCategories: ['All categories', 'ሁሉም ምድቦች'], allLanguages: ['All languages', 'ሁሉም ቋንቋዎች'],
  sortRelevance: ['Best match', 'ተስማሚነት'], sortTitle: ['Title', 'ርዕስ'], sortAuthor: ['Author', 'ደራሲ'],
  author: ['Author', 'ደራሲ'], category: ['Category', 'ምድብ'], language: ['Language', 'ቋንቋ'],
  unknownAuthor: ['Unknown author', 'ደራሲው ያልታወቀ'], untitled: ['Book #{id}', 'መጽሐፍ ቁ. {id}'],
  read: ['Read', 'አንብብ'], download: ['Download', 'አውርድ'], listen: ['Listen', 'አዳምጥ'],
  files: ['Files', 'ፋይሎች'], fullBook: ['Full book', 'ሙሉ መጽሐፍ'], part: ['Part {n}', 'ክፍል {n}'],
  notCopied: ['This file hasn’t been copied to the new library yet.', 'ይህ ፋይል ገና ወደ አዲሱ ቤተ መጻሕፍት አልተገለበጠም።'],
  gone: ['Missing on the original site', 'በዋናው ገጽ ላይ የለም'],
  loading: ['Loading…', 'በመጫን ላይ…'], back: ['← Back', '← ተመለስ'], showMore: ['Show more', 'ተጨማሪ አሳይ'],
  signInTitle: ['Private preview', 'የግል ቅድመ እይታ'],
  signInBody: ['This rebuild of good-amharic-books.com is not public yet. Sign in with an approved Google account to continue.',
    'ይህ የgood-amharic-books.com አዲስ ገጽ ገና ለሕዝብ አልተከፈተም። ለመቀጠል በተፈቀደ የGoogle መለያ ይግቡ።'],
  signIn: ['Sign in with Google', 'በGoogle ይግቡ'], signOut: ['Sign out', 'ውጣ'],
  noAccess: ['{email} doesn’t have access to this preview.', '{email} ይህን ቅድመ እይታ የማየት ፈቃድ የለውም።'],
  useOther: ['Use another account', 'ሌላ መለያ ይጠቀሙ'],
  aboutTitle: ['About this library', 'ስለዚህ ቤተ መጻሕፍት'],
  aboutBody: [
    'This is a modern rebuild of good-amharic-books.com, an online library of Christian books in Amharic and other Ethiopian languages. The original site is published by Interlitt, the publishing arm of the Lapsley/Brooks Foundation; all books and their contents belong to their respective authors and publishers.',
    'ይህ የgood-amharic-books.com ዘመናዊ ቅጂ ነው፤ በአማርኛና በሌሎች የኢትዮጵያ ቋንቋዎች የተዘጋጁ ክርስቲያናዊ መጻሕፍት የሚገኙበት የመስመር ላይ ቤተ መጻሕፍት ነው። ዋናው ገጽ የሚታተመው በLapsley/Brooks Foundation የሕትመት ክፍል በሆነው Interlitt ነው፤ መጻሕፍቱና ይዘታቸው የየደራሲዎቻቸውና የአሳታሚዎቻቸው ናቸው።'],
  aboutPreview: ['Private preview: not published. Waiting for permission from the original publisher.',
    'የግል ቅድመ እይታ፦ አልታተመም። ከዋናው አሳታሚ ፈቃድ በመጠበቅ ላይ።'],
  original: ['Visit the original site', 'ዋናውን ገጽ ይጎብኙ'],
  pdfNote: ['Books open in your browser’s PDF reader.', 'መጻሕፍቱ በአሳሽዎ የPDF ማንበቢያ ይከፈታሉ።'],
};

let current = localStorage.getItem('gab-lang') || 'en';
export function lang() { return current; }
export function setLang(l) { current = l; localStorage.setItem('gab-lang', l); document.documentElement.lang = l; }
export function t(key, vars = {}) {
  const e = T[key]; let s = e ? e[current === 'am' ? 1 : 0] : key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
