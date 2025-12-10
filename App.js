import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, onSnapshot, query, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { Plane, Train, Bus, Ship, Car, MapPin, DollarSign, Trash2, Plus, X, Globe, ChevronLeft, ChevronRight, Check, Armchair, FileText, Ticket, RefreshCw, Coins, AlertTriangle, Menu, Download, Loader, Edit2 } from 'lucide-react';

// 直接引用安裝好的套件
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';

// 修正 Leaflet 預設圖標遺失的問題
// 這些圖片檔案會隨著 npm install leaflet 自動下載到您的專案中
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// -----------------------------------------------------------------------------
// 1. Firebase 初始化 (您的專屬金鑰)
// -----------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCFNcDaHTOx4lETnJk844Eq6EZs1AbF9_8",
  authDomain: "my-travel-map-db74a.firebaseapp.com",
  projectId: "my-travel-map-db74a",
  storageBucket: "my-travel-map-db74a.firebasestorage.app",
  messagingSenderId: "143054225690",
  appId: "1:143054225690:web:ff2d9355401cce41c02ca3"
};

// 避免重複初始化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'travel-map-v1'; 

// -----------------------------------------------------------------------------
// 2. 常數與輔助設定
// -----------------------------------------------------------------------------
const TRANSPORT_TYPES = {
  plane: { label: '飛機', color: '#2563eb', icon: Plane, useRoute: false },
  train: { label: '火車', color: '#dc2626', icon: Train, useRoute: true },
  bus:   { label: '公車/巴士', color: '#15803d', icon: Bus, useRoute: true },
  car:   { label: '開車', color: '#84cc16', icon: Car, useRoute: true },
  boat:  { label: '船運', color: '#000000', icon: Ship, useRoute: false },
};

const SEAT_TYPES = {
  window: '靠窗',
  middle: '中間',
  aisle: '走道',
  none: '無/其他'
};

const CURRENCIES = [
  { code: 'EUR', label: '歐元' },
  { code: 'TWD', label: '新台幣' },
  { code: 'USD', label: '美金' },
  { code: 'GBP', label: '英鎊' },
  { code: 'CHF', label: '瑞士法郎' },
  { code: 'MAD', label: '摩洛哥迪拉姆' }, 
  { code: 'SEK', label: '瑞典克朗' },
  { code: 'NOK', label: '挪威克朗' },
  { code: 'DKK', label: '丹麥克朗' },
  { code: 'ISK', label: '冰島克朗' },
  { code: 'CZK', label: '捷克克朗' },
  { code: 'HUF', label: '匈牙利福林' },
  { code: 'PLN', label: '波蘭茲羅提' },
  { code: 'RON', label: '羅馬尼亞列伊' },
  { code: 'BGN', label: '保加利亞列弗' },
  { code: 'TRY', label: '土耳其里拉' },
  { code: 'RSD', label: '塞爾維亞第納爾' },
  { code: 'BAM', label: '波士尼亞馬克' },
  { code: 'ALL', label: '阿爾巴尼亞列克' },
  { code: 'MKD', label: '馬其頓代納爾' },
  { code: 'UAH', label: '烏克蘭格里夫納' },
  { code: 'JPY', label: '日圓' },
  { code: 'KRW', label: '韓元' },
  { code: 'CNY', label: '人民幣' },
  { code: 'AUD', label: '澳幣' },
  { code: 'CAD', label: '加幣' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

// --- 翻譯資料庫 ---
const COUNTRY_TRANSLATIONS = {
  "France": "法國", "Germany": "德國", "United Kingdom": "英國", "Italy": "義大利", 
  "Spain": "西班牙", "Netherlands": "荷蘭", "Belgium": "比利時", "Switzerland": "瑞士",
  "Austria": "奧地利", "Czech Republic": "捷克", "Poland": "波蘭", "Hungary": "匈牙利",
  "Portugal": "葡萄牙", "Greece": "希臘", "Sweden": "瑞典", "Norway": "挪威",
  "Finland": "芬蘭", "Denmark": "丹麥", "Ireland": "愛爾蘭", "Iceland": "冰島",
  "Luxembourg": "盧森堡", "Monaco": "摩納哥", "Vatican City": "梵蒂岡", "Liechtenstein": "列支敦斯登",
  "Malta": "馬爾他", "Cyprus": "賽普勒斯", "Estonia": "愛沙尼亞", "Latvia": "拉脫維亞",
  "Lithuania": "立陶宛", "Slovakia": "斯洛伐克", "Slovenia": "斯洛維尼亞", "Croatia": "克羅埃西亞",
  "Romania": "羅馬尼亞", "Bulgaria": "保加利亞", "Serbia": "塞爾維亞", "Bosnia and Herzegovina": "波士尼亞",
  "Ukraine": "烏克蘭", "Russia": "俄羅斯", "Turkey": "土耳其", "North Macedonia": "北馬其頓",
  "Albania": "阿爾巴尼亞", "Montenegro": "蒙特內哥羅",
  
  "Japan": "日本", "South Korea": "韓國", "Korea, South": "韓國", "Taiwan": "台灣", "China": "中國",
  "Hong Kong": "香港", "Macao": "澳門", "Singapore": "新加坡", "Malaysia": "馬來西亞",
  "Thailand": "泰國", "Vietnam": "越南", "Philippines": "菲律賓", "Indonesia": "印尼",
  "India": "印度", "Cambodia": "柬埔寨", "Myanmar": "緬甸", "Laos": "寮國",
  "United Arab Emirates": "阿拉伯聯合大公國", "Qatar": "卡達", "Saudi Arabia": "沙烏地阿拉伯",
  "Israel": "以色列", "Jordan": "約旦",
  
  "United States": "美國", "Canada": "加拿大", "Mexico": "墨西哥", "Brazil": "巴西", 
  "Argentina": "阿根廷", "Chile": "智利", "Peru": "秘魯", "Colombia": "哥倫比亞",
  "Australia": "澳洲", "New Zealand": "紐西蘭",
  "Egypt": "埃及", "South Africa": "南非", "Morocco": "摩洛哥", "Kenya": "肯亞", "Tanzania": "坦尚尼亞"
};

const CITY_TRANSLATIONS = {
  "Taipei": "台北", "Kaohsiung": "高雄", "Taichung": "台中", "Tainan": "台南", "Taoyuan": "桃園", "Hsinchu": "新竹", "Keelung": "基隆", "Chiayi": "嘉義", "Hualien": "花蓮", "Taitung": "台東",

  "Istanbul": "伊斯坦堡", "İstanbul": "伊斯坦堡", "Ankara": "安卡拉", "Izmir": "伊茲密爾", "İzmir": "伊茲密爾", "Antalya": "安塔利亞", "Bursa": "布爾薩", "Goreme": "格雷梅 (卡帕多奇亞)", "Göreme": "格雷梅 (卡帕多奇亞)", "Nevsehir": "內夫謝希爾", "Nevşehir": "內夫謝希爾", "Kayseri": "凱塞利", "Pamukkale": "棉堡", "Denizli": "德尼茲利 (棉堡入口)", "Konya": "孔亞", "Bodrum": "博德魯姆", "Fethiye": "費特希耶", "Kas": "卡什", "Kaş": "卡什", "Selcuk": "塞爾丘克 (以弗所)", "Selçuk": "塞爾丘克 (以弗所)", "Ephesus": "以弗所", "Canakkale": "恰納卡萊", "Çanakkale": "恰納卡萊", "Trabzon": "特拉布宗", "Adana": "阿達納", "Gaziantep": "加濟安泰普", "Sanliurfa": "尚勒烏爾法", "Şanlıurfa": "尚勒烏爾法", "Mardin": "馬爾丁", "Alanya": "阿蘭亞", "Kusadasi": "庫薩達斯", "Kuşadası": "庫薩達斯",

  "Tokyo": "東京", "Osaka": "大阪", "Kyoto": "京都", "Seoul": "首爾", "Busan": "釜山", "Sapporo": "札幌", "Fukuoka": "福岡", "Nagoya": "名古屋", "Okinawa": "沖繩", "Naha": "那霸", "Kobe": "神戶", "Nara": "奈良", "Hiroshima": "廣島", "Sendai": "仙台", "Kanazawa": "金澤", "Takayama": "高山", "Hakone": "箱根", "Nikko": "日光", "Kamakura": "鎌倉",

  "Paris": "巴黎", "Lyon": "里昂", "Marseille": "馬賽", "Nice": "尼斯", "Bordeaux": "波爾多", "Strasbourg": "史特拉斯堡", "Toulouse": "土魯斯", "Avignon": "亞維儂", "Cannes": "坎城", "Chamonix": "夏慕尼", "Lille": "里爾", "Nantes": "南特", "Montpellier": "蒙皮立", "Aix-en-Provence": "普羅旺斯地區艾克斯", "Colmar": "科爾馬", "Annecy": "安錫", "Dijon": "第戎", "Versailles": "凡爾賽", "Arles": "亞爾", "Nimes": "尼姆", "Carcassonne": "卡爾卡松",

  "Berlin": "柏林", "Munich": "慕尼黑", "Frankfurt": "法蘭克福", "Hamburg": "漢堡", "Cologne": "科隆", "Heidelberg": "海德堡", "Dresden": "德勒斯登", "Nuremberg": "紐倫堡", "Rothenburg ob der Tauber": "羅滕堡", "Stuttgart": "斯圖加特", "Dusseldorf": "杜塞道夫", "Leipzig": "萊比錫", "Bremen": "布萊梅", "Bonn": "波昂", "Freiburg": "弗萊堡", "Berchtesgaden": "貝希特斯加登 (國王湖)", "Fussen": "福森 (新天鵝堡)", "Füssen": "福森 (新天鵝堡)",

  "London": "倫敦", "Edinburgh": "愛丁堡", "Manchester": "曼徹斯特", "Liverpool": "利物浦", "Oxford": "牛津", "Cambridge": "劍橋", "Bath": "巴斯", "York": "約克", "Glasgow": "格拉斯哥", "Birmingham": "伯明罕", "Bristol": "布里斯托", "Brighton": "布萊頓", "Cardiff": "卡地夫", "Belfast": "貝爾法斯特", "Inverness": "因弗尼斯",

  "Rome": "羅馬", "Milan": "米蘭", "Venice": "威尼斯", "Florence": "佛羅倫斯", "Naples": "拿坡里", "Turin": "杜林", "Verona": "維洛納", "Pisa": "比薩", "Bologna": "波隆那", "Genoa": "熱那亞", "Palermo": "巴勒莫", "Siena": "錫耶納", "Cinque Terre": "五漁村", "Amalfi": "阿瑪菲", "Positano": "波西塔諾", "Sorrento": "蘇連多", "Capri": "卡布里島", "Como": "科莫", "Bergamo": "貝爾加莫",

  "Madrid": "馬德里", "Barcelona": "巴塞隆納", "Seville": "塞維亞", "Valencia": "瓦倫西亞", "Granada": "格拉納達", "Bilbao": "畢爾包", "Malaga": "馬拉加", "Toledo": "托雷多", "Cordoba": "哥多華", "Segovia": "塞哥維亞", "San Sebastian": "聖塞巴斯蒂安", "Lisbon": "里斯本", "Porto": "波多", "Sintra": "辛特拉", "Faro": "法魯", "Coimbra": "科英布拉",

  "Amsterdam": "阿姆斯特丹", "Rotterdam": "鹿特丹", "The Hague": "海牙", "Utrecht": "烏特勒支", "Eindhoven": "愛因霍芬", "Delft": "台夫特", "Maastricht": "馬斯垂克", "Giethoorn": "羊角村", "Brussels": "布魯塞爾", "Bruges": "布魯日", "Ghent": "根特", "Antwerp": "安特衛普", "Luxembourg": "盧森堡市",

  "Zurich": "蘇黎世", "Geneva": "日內瓦", "Bern": "伯恩", "Lucerne": "琉森", "Interlaken": "因特拉肯", "Basel": "巴塞爾", "Lausanne": "洛桑", "Zermatt": "策馬特", "Grindelwald": "格林德瓦", "Vienna": "維也納", "Salzburg": "薩爾斯堡", "Hallstatt": "哈爾施塔特", "Innsbruck": "因斯布魯克", "Graz": "格拉茲", "Linz": "林茲",

  "Prague": "布拉格", "Cesky Krumlov": "庫倫洛夫", "Brno": "布爾諾", "Budapest": "布達佩斯", "Debrecen": "德布勒森", "Warsaw": "華沙", "Krakow": "克拉科夫", "Gdansk": "格但斯克", "Wroclaw": "弗羅茨瓦夫", "Bratislava": "布拉提斯拉瓦", "Bucharest": "布加勒斯特", "Sofia": "索菲亞", "Dubrovnik": "杜布羅夫尼克", "Split": "斯普利特", "Zagreb": "札格瑞布", "Ljubljana": "盧布爾雅那", "Bled": "布萊德",

  "Stockholm": "斯德哥爾摩", "Gothenburg": "哥德堡", "Malmo": "馬爾默", "Kiruna": "基律納", "Copenhagen": "哥本哈根", "Aarhus": "奧胡斯", "Odense": "歐登塞", "Oslo": "奧斯陸", "Bergen": "卑爾根", "Stavanger": "斯塔萬格", "Tromso": "特羅姆瑟", "Helsinki": "赫爾辛基", "Rovaniemi": "羅瓦涅米 (聖誕老人村)", "Reykjavik": "雷克雅維克",

  "Athens": "雅典", "Santorini": "聖托里尼", "Mykonos": "米克諾斯", "Thessaloniki": "塞薩洛尼基", "Moscow": "莫斯科", "Saint Petersburg": "聖彼得堡", "Bangkok": "曼谷", "Ho Chi Minh City": "胡志明市", "Hanoi": "河內", "Singapore": "新加坡", "Chiang Mai": "清邁", "Phuket": "普吉島", "Bali": "峇里島", "Da Nang": "峴港",
  
  "New York": "紐約", "Los Angeles": "洛杉磯", "San Francisco": "舊金山", "Chicago": "芝加哥", "Toronto": "多倫多", "Vancouver": "溫哥華", "Sydney": "雪梨", "Melbourne": "墨爾本", "Brisbane": "布里斯本", "Perth": "柏斯", "Auckland": "奧克蘭", "Christchurch": "基督城", "Queenstown": "皇后鎮", "Cairo": "開羅", "Marrakech": "馬拉喀什"
};

const getDisplayCityName = (englishName) => {
  if (!englishName) return '';
  const chinese = CITY_TRANSLATIONS[englishName];
  if (chinese) {
    const famousCities = [
      "巴黎", "倫敦", "柏林", "羅馬", "東京", "台北", "紐約", "首爾", "曼谷", 
      "維也納", "布拉格", "阿姆斯特丹", "巴塞隆納", "馬德里", "米蘭", "威尼斯", "佛羅倫斯", 
      "慕尼黑", "法蘭克福", "布達佩斯", "華沙", "蘇黎世", "日內瓦", "布魯塞爾", 
      "哥本哈根", "斯德哥爾摩", "奧斯陸", "赫爾辛基", "雅典", "里斯本", "愛丁堡", 
      "曼徹斯特", "都柏林", "莫斯科", "基輔", "伊斯坦堡", "杜拜", "新加坡", "香港", "澳門", 
      "北京", "上海", "廣州", "深圳", "雪梨", "墨爾本", "奧克蘭", "溫哥華", "多倫多", 
      "洛杉磯", "舊金山", "芝加哥", "西雅圖", "波士頓", "邁阿密", "拉斯維加斯", "檀香山",
      "安卡拉", "開羅"
    ];
    if (famousCities.includes(chinese) || chinese.includes('(')) return chinese;
    return `${chinese} (${englishName})`;
  }
  return englishName;
};

const getDisplayCountryName = (englishName) => COUNTRY_TRANSLATIONS[englishName] || englishName;

// Helper: Fetch Route from OSRM
const fetchRoutePath = async (lat1, lng1, lat2, lng2) => {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const coords = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
            return coords;
        }
    } catch (e) {
        console.error("OSRM Route Fetch Error:", e);
    }
    return null;
};

const TimeSelector = ({ value, onChange }) => {
  const [hh, mm] = (value || '').split(':');
  const handleChange = (type, val) => {
    let newH = hh || '00';
    let newM = mm || '00';
    if (type === 'h') newH = val;
    if (type === 'm') newM = val;
    onChange(`${newH}:${newM}`);
  };
  return (
    <div className="flex items-center gap-1">
      <select className="p-2 border rounded bg-white w-16 text-center" value={hh || ''} onChange={(e) => handleChange('h', e.target.value)}>
        <option value="" disabled>時</option>
        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="font-bold text-gray-400">:</span>
      <select className="p-2 border rounded bg-white w-16 text-center" value={mm || ''} onChange={(e) => handleChange('m', e.target.value)}>
        <option value="" disabled>分</option>
        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [trips, setTrips] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // 狀態管理：匯出選項
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportMode, setExportMode] = useState('all'); // 'all' or 'range'
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportDateRangeText, setExportDateRangeText] = useState('');

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  
  const [editingId, setEditingId] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const [allCountries, setAllCountries] = useState([]);
  const [originCities, setOriginCities] = useState([]);
  const [destCities, setDestCities] = useState([]);
  const [isLoadingOriginCities, setIsLoadingOriginCities] = useState(false);
  const [isLoadingDestCities, setIsLoadingDestCities] = useState(false);
  
  const [formData, setFormData] = useState({
    originCountry: '', originCity: '', originLat: null, originLng: null,
    destCountry: '', destCity: '', destLat: null, destLng: null,
    dateStart: '', timeStart: '', dateEnd: '', timeEnd: '',
    transport: 'plane', cost: '', currency: 'EUR',
    transportNumber: '', seatNumber: '', seatType: 'window', notes: '',
    targetCountry: '', routePath: null
  });

  const mapContainerRef = useRef(null);
  const captureRef = useRef(null); 
  const mapInstanceRef = useRef(null);
  const geoJsonLayerRef = useRef(null);
  const tripLinesRef = useRef([]); 
  const pickingLocationMode = useRef(null); 
  const layersRef = useRef([]); 
  const pickerMarkerRef = useRef(null);
  
  const latestDataRef = useRef({ trips: [], allCountries: [] });

  // 1. Safe date formatting
  const safeDateDisplay = (date) => {
    if (!date) return '';
    if (typeof date === 'string') return date;
    // Check if it is a Firestore Timestamp
    if (date?.toDate) return date.toDate().toLocaleDateString();
    return String(date);
  };

  useEffect(() => {
    latestDataRef.current = { trips, allCountries };
  }, [trips, allCountries]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'travel_trips'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const loadedTrips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTrips(loadedTrips);
        setLoading(false);
      },
      (error) => {
        const fallbackQ = collection(db, 'artifacts', appId, 'users', user.uid, 'travel_trips');
        onSnapshot(fallbackQ, (snap) => {
            const loaded = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            loaded.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setTrips(loaded);
            setLoading(false);
        });
      }
    );
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const response = await fetch('https://countriesnow.space/api/v0.1/countries');
        const data = await response.json();
        if (!data.error && data.data) {
          const countries = data.data.map(c => ({
            name: c.country,
            label: getDisplayCountryName(c.country)
          }));
          
          countries.sort((a, b) => {
             if (a.name === "Taiwan") return -1;
             if (b.name === "Taiwan") return 1;
             return a.name.localeCompare(b.name);
          });
          
          setAllCountries(countries);
        }
      } catch (error) {
        console.error("Failed to fetch countries", error);
      }
    };
    fetchCountries();
  }, []);

  const fetchCoordinates = async (city, country) => {
    try {
      const query = `${city.split(' (')[0]}, ${country}`;
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch (e) {
      console.error("Geocoding error:", e);
    }
    return null;
  };

  const fetchCitiesForCountry = async (country, type) => {
    if (!country) return;
    const setLoading = type === 'origin' ? setIsLoadingOriginCities : setIsLoadingDestCities;
    const setCities = type === 'origin' ? setOriginCities : setDestCities;

    setLoading(true);
    try {
      const response = await fetch('https://countriesnow.space/api/v0.1/countries/cities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: country })
      });
      const data = await response.json();
      if (!data.error && data.data) {
        const processedCities = data.data.map(city => ({
          value: getDisplayCityName(city),
          label: getDisplayCityName(city),
          original: city
        }));
        processedCities.sort((a, b) => a.label.localeCompare(b.label));
        setCities(processedCities);
      } else {
        setCities([]);
      }
    } catch (error) {
      console.error(`Failed to fetch cities for ${country}`, error);
      setCities([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 建立地圖實例
    if (!mapContainerRef.current) return;
    
    // 如果地圖已經存在，不需要重複建立，但確保 resize
    if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        return;
    }

    const map = L.map(mapContainerRef.current, { preferCanvas: true }).setView([48, 15], 4); 
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
      crossOrigin: true 
    }).addTo(map);
    mapInstanceRef.current = map;

    map.on('click', (e) => {
      if (pickingLocationMode.current) {
        const { lat, lng } = e.latlng;
        setFormData(prev => ({
          ...prev,
          [pickingLocationMode.current === 'origin' ? 'originLat' : 'destLat']: lat,
          [pickingLocationMode.current === 'origin' ? 'originLng' : 'destLng']: lng,
        }));
        
        if (pickerMarkerRef.current) {
            map.removeLayer(pickerMarkerRef.current);
        }

        pickerMarkerRef.current = L.circleMarker([lat, lng], {
            radius: 8,
            color: '#f97316',
            fillColor: '#f97316',
            fillOpacity: 0.8,
            weight: 2
        }).addTo(map).bindPopup(pickingLocationMode.current === 'origin' ? "出發地" : "目的地").openPopup();
      }
    });

    fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
      .then(res => res.json())
      .then(data => {
        geoJsonLayerRef.current = L.geoJSON(data, {
          style: { fillColor: '#cbd5e1', weight: 1, opacity: 1, color: 'white', fillOpacity: 0.5 },
          onEachFeature: (feature, layer) => {
            const countryName = feature.properties.name;
            const displayName = getDisplayCountryName(countryName);
            layer.bindTooltip(displayName, { sticky: true, direction: 'top' });
            layer.on({
              mouseover: (e) => { e.target.setStyle({ weight: 2, color: '#666', fillOpacity: 0.7 }); },
              mouseout: (e) => { if (geoJsonLayerRef.current) geoJsonLayerRef.current.resetStyle(e.target); },
              click: (e) => {
                if (pickingLocationMode.current) {
                  fetchCitiesForCountry(countryName, pickingLocationMode.current);
                  setFormData(prev => ({
                    ...prev,
                    [pickingLocationMode.current === 'origin' ? 'originCountry' : 'destCountry']: countryName,
                    [pickingLocationMode.current === 'origin' ? 'originCity' : 'destCity']: ''
                  }));
                } else {
                  const { trips } = latestDataRef.current;
                  let initOriginCountry = '';
                  let initOriginCity = '';
                  let initOriginLat = null;
                  let initOriginLng = null;
                  let initDestCountry = '';

                  if (trips.length > 0) {
                      const sortedTrips = [...trips].sort((a, b) => new Date(b.dateEnd) - new Date(a.dateEnd));
                      const lastTrip = sortedTrips[0];
                      initOriginCountry = lastTrip.destCountry || lastTrip.targetCountry;
                      initOriginCity = lastTrip.destCity;
                      initOriginLat = lastTrip.destLat;
                      initOriginLng = lastTrip.destLng;
                  } 

                  setFormData({
                    originCountry: initOriginCountry, originCity: initOriginCity, 
                    originLat: initOriginLat, originLng: initOriginLng,
                    destCountry: initDestCountry, destCity: '', destLat: null, destLng: null,
                    dateStart: '', timeStart: '', dateEnd: '', timeEnd: '',
                    transport: 'plane', cost: '', currency: 'EUR',
                    transportNumber: '', seatNumber: '', seatType: 'window', notes: '',
                    targetCountry: countryName, routePath: null
                  });
                  setEditingId(null);
                  
                  if (initOriginCountry) fetchCitiesForCountry(initOriginCountry, 'origin');
                  setDestCities([]); 
                  
                  setIsModalOpen(true);
                }
              }
            });
          }
        }).addTo(map);
      });
  }, []);

  const renderMapLayers = (tripsToRender) => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    
    layersRef.current.forEach(layer => map.removeLayer(layer));
    layersRef.current = [];
    
    if (pickerMarkerRef.current) {
        map.removeLayer(pickerMarkerRef.current);
        pickerMarkerRef.current = null;
    }

    if (geoJsonLayerRef.current) {
        const today = new Date().toISOString().split('T')[0];
        const activeTrips = tripsToRender.filter(t => t.dateStart && t.dateStart <= today);
        const visitedCountries = new Set(activeTrips.flatMap(t => [t.targetCountry, t.destCountry, t.originCountry]).filter(Boolean));
        
        geoJsonLayerRef.current.eachLayer((layer) => {
          const countryName = layer.feature.properties.name;
          if (visitedCountries.has(countryName)) {
            layer.setStyle({ fillColor: '#fcd34d', fillOpacity: 0.8, weight: 1 });
          } else {
            layer.setStyle({ fillColor: '#cbd5e1', fillOpacity: 0.5 });
          }
        });
    }

    tripsToRender.forEach(trip => {
      if (trip.originLat && trip.originLng && trip.destLat && trip.destLng) {
        const latlngs = [[trip.originLat, trip.originLng], [trip.destLat, trip.destLng]];
        const typeConfig = TRANSPORT_TYPES[trip.transport] || TRANSPORT_TYPES.plane;
        
        const today = new Date().toISOString().split('T')[0];
        const isFutureOrNoDate = !trip.dateStart || trip.dateStart > today;

        const polyline = L.polyline(latlngs, {
          color: typeConfig.color, 
          weight: 3, 
          opacity: 0.8,
          dashArray: isFutureOrNoDate ? '10, 10' : null 
        }).addTo(map);

        const originMarker = L.circleMarker([trip.originLat, trip.originLng], { radius: 4, color: typeConfig.color, fillOpacity: 1 }).addTo(map);
        const destMarker = L.circleMarker([trip.destLat, trip.destLng], { radius: 4, color: typeConfig.color, fillOpacity: 1 }).addTo(map);
        
        const dateDisplay = trip.dateStart ? `${safeDateDisplay(trip.dateStart)} ${trip.timeStart || ''}` : '';
        polyline.bindPopup(`
          <div class="font-sans min-w-[200px]">
            <h3 class="font-bold text-lg mb-1">${trip.originCity} ➝ ${trip.destCity}</h3>
            <div class="text-sm text-gray-700 space-y-1">
              <p><span style="color:${typeConfig.color}">●</span> ${typeConfig.label} | ${dateDisplay}</p>
              ${trip.cost ? `<p>費用: ${trip.currency} ${trip.cost}</p>` : ''}
            </div>
          </div>
        `);

        layersRef.current.push(polyline, originMarker, destMarker);
      }
    });
  };

  useEffect(() => {
    if (!loading && !isExporting) { 
        renderMapLayers(trips);
    }
  }, [trips, loading, isExporting]);

  const [isPickingMode, setIsPickingMode] = useState(false);

  const openModal = (countryName = '', tripToEdit = null) => {
    if (mapInstanceRef.current && pickerMarkerRef.current) {
        mapInstanceRef.current.removeLayer(pickerMarkerRef.current);
        pickerMarkerRef.current = null;
    }

    if (tripToEdit) {
        setEditingId(tripToEdit.id);
        setFormData({ ...tripToEdit });
        fetchCitiesForCountry(tripToEdit.originCountry, 'origin');
        fetchCitiesForCountry(tripToEdit.destCountry, 'dest');
    } else {
        setEditingId(null);
        const { trips } = latestDataRef.current;

        let initOriginCountry = '';
        let initOriginCity = '';
        let initOriginLat = null;
        let initOriginLng = null;

        if (trips.length > 0) {
            const sortedTrips = [...trips].sort((a, b) => new Date(b.dateEnd || 0) - new Date(a.dateEnd || 0));
            const lastTrip = sortedTrips[0];
            initOriginCountry = lastTrip.destCountry || lastTrip.targetCountry;
            initOriginCity = lastTrip.destCity;
            initOriginLat = lastTrip.destLat;
            initOriginLng = lastTrip.destLng;
        }

        setFormData({
          originCountry: initOriginCountry, 
          originCity: initOriginCity, 
          originLat: initOriginLat, 
          originLng: initOriginLng,
          destCountry: '', destCity: '', destLat: null, destLng: null,
          dateStart: '', timeStart: '', dateEnd: '', timeEnd: '',
          transport: 'plane', cost: '', currency: 'EUR',
          transportNumber: '', seatNumber: '', seatType: 'window', notes: '',
          targetCountry: countryName, routePath: null
        });
        
        if (initOriginCountry) fetchCitiesForCountry(initOriginCountry, 'origin');
        else setOriginCities([]);
        setDestCities([]);
    }
    setIsModalOpen(true);
  };

  const startPicking = (type) => {
    pickingLocationMode.current = type;
    setIsModalOpen(false); 
    setIsPickingMode(true);
    const style = document.createElement('style');
    style.id = 'map-cursor-style';
    style.innerHTML = `.leaflet-container { cursor: crosshair !important; }`;
    document.head.appendChild(style);
  };

  useEffect(() => {
    if(!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const handleMapClick = () => {
      setTimeout(() => {
         if (isPickingMode) {
             setIsPickingMode(false);
             setIsModalOpen(true); 
             const cursorStyle = document.getElementById('map-cursor-style');
             if (cursorStyle) cursorStyle.innerHTML = '';
         }
         pickingLocationMode.current = null;
      }, 200);
    };
    map.on('click', handleMapClick);
    return () => map.off('click', handleMapClick);
  }, [isPickingMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    
    // Auto-fetch route before saving
    let finalRoutePath = null;
    const transportType = TRANSPORT_TYPES[formData.transport];
    
    // Check if coordinates exist before fetching route
    if (transportType && transportType.useRoute && 
        formData.originLat && formData.originLng && formData.destLat && formData.destLng) {
        // Fetch coordinates
        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${formData.originLng},${formData.originLat};${formData.destLng},${formData.destLat}?overview=full&geometries=geojson`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                // OSRM returns [lng, lat], Leaflet needs [lat, lng]
                finalRoutePath = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
            }
        } catch(e) { console.error("Route error", e); }
    }
    
    const finalData = {
        ...formData,
        routePath: finalRoutePath 
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'travel_trips', editingId), {
            ...finalData,
            updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'travel_trips'), {
            ...finalData,
            createdAt: serverTimestamp(),
        });
      }
      setIsModalOpen(false);
      
      if (mapInstanceRef.current && pickerMarkerRef.current) {
          mapInstanceRef.current.removeLayer(pickerMarkerRef.current);
          pickerMarkerRef.current = null;
      }
    } catch (err) {
      console.error("Error saving trip:", err);
    }
  };

  const requestDelete = (e, id) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!user || !deleteConfirmId) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'travel_trips', deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Error deleting trip:", err);
    }
  };

  const performExport = async () => {
    if (!captureRef.current || !html2canvas || !mapInstanceRef.current) return;
    
    setIsExporting(true);
    setIsExportModalOpen(false);
    
    const map = mapInstanceRef.current;
    const originalCenter = map.getCenter();
    const originalZoom = map.getZoom();

    const controls = document.querySelectorAll('.leaflet-control-zoom, .leaflet-control-attribution');
    controls.forEach(el => el.style.display = 'none');

    const originalStyle = {
        width: captureRef.current.style.width,
        height: captureRef.current.style.height,
        position: captureRef.current.style.position,
        top: captureRef.current.style.top,
        left: captureRef.current.style.left,
        zIndex: captureRef.current.style.zIndex,
    };
    captureRef.current.style.width = '1600px';
    captureRef.current.style.height = '1200px';
    captureRef.current.style.position = 'fixed';
    captureRef.current.style.top = '0';
    captureRef.current.style.left = '0';
    captureRef.current.style.zIndex = '9999';
    map.invalidateSize();

    let filteredTrips = trips;
    if (exportMode === 'range' && exportStartDate && exportEndDate) {
        filteredTrips = trips.filter(t => t.dateStart >= exportStartDate && t.dateStart <= exportEndDate);
    }
    
    if (filteredTrips.length > 0) {
        const dates = filteredTrips.map(t => t.dateStart).filter(Boolean).sort();
        if (dates.length > 0) {
            setExportDateRangeText(`${dates[0]} ~ ${dates[dates.length - 1]}`);
        } else {
            setExportDateRangeText('不限日期');
        }
    } else {
        setExportDateRangeText('');
    }

    renderMapLayers(filteredTrips);

    let bounds = window.L.latLngBounds([]);
    let hasPoints = false;
    filteredTrips.forEach(t => {
        if (t.originLat && t.originLng) { bounds.extend([t.originLat, t.originLng]); hasPoints = true; }
        if (t.destLat && t.destLng) { bounds.extend([t.destLat, t.destLng]); hasPoints = true; }
    });

    if (hasPoints && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], animate: false });
    } else {
        map.setView([20, 0], 2, { animate: false });
    }

    setTimeout(async () => {
        try {
            await new Promise(resolve => setTimeout(resolve, 1200)); 

            const canvas = await html2canvas(captureRef.current, {
                useCORS: true,
                allowTaint: true,
                logging: false,
                scale: 1.5,
                width: 1600,
                height: 1200,
                windowWidth: 1600,
                windowHeight: 1200
            });
            
            canvas.toBlob((blob) => {
                if (!blob) { alert("匯出失敗"); return; }
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                const timestamp = new Date().toISOString().slice(0,10);
                const rangeText = exportMode === 'range' ? `-${exportStartDate}-to-${exportEndDate}` : '-all';
                link.download = `travel-map${rangeText}-${timestamp}.png`;
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 'image/png');

        } catch (err) {
            console.error("Export failed:", err);
            alert("匯出失敗");
        } finally {
            captureRef.current.style.width = originalStyle.width;
            captureRef.current.style.height = originalStyle.height;
            captureRef.current.style.position = originalStyle.position;
            captureRef.current.style.top = originalStyle.top;
            captureRef.current.style.left = originalStyle.left;
            captureRef.current.style.zIndex = originalStyle.zIndex;
            controls.forEach(el => el.style.display = '');
            
            map.invalidateSize();
            map.setView(originalCenter, originalZoom, { animate: false });
            renderMapLayers(trips); 
            setIsExporting(false);
            setExportDateRangeText('');
        }
    }, 500);
  };

  const renderCityInput = (type) => {
    const isOrigin = type === 'origin';
    const cities = isOrigin ? originCities : destCities;
    const isLoading = isOrigin ? isLoadingOriginCities : isLoadingDestCities;
    
    const fieldCountry = isOrigin ? 'originCountry' : 'destCountry';
    const fieldCity = isOrigin ? 'originCity' : 'destCity';
    const fieldLat = isOrigin ? 'originLat' : 'destLat';
    const fieldLng = isOrigin ? 'originLng' : 'destLng';
    
    const label = isOrigin ? '出發城市/地點' : '抵達城市/地點';
    const placeholder = isOrigin ? '例如: 台北' : '例如: 東京';
    const showSelect = cities.length > 0;

    return (
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700 flex justify-between">
            {isOrigin ? '出發城市/地點' : '抵達城市/地點'}
            {isLoading && <span className="text-xs text-blue-500 font-normal flex items-center gap-1"><RefreshCw size={10} className="animate-spin"/> 載入城市中...</span>}
        </label>
        
        <div className="mb-2">
            <select
                className="w-full p-2 border rounded text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={formData[fieldCountry]}
                onChange={(e) => {
                    const newCountry = e.target.value;
                    setFormData({ ...formData, [fieldCountry]: newCountry, [fieldCity]: '', [fieldLat]: null, [fieldLng]: null }); 
                    fetchCitiesForCountry(newCountry, type);
                }}
            >
                <option value="" disabled>請選擇國家</option>
                {allCountries.map(c => (
                    <option key={c.name} value={c.name}>{c.label}</option>
                ))}
            </select>
        </div>

        <div className="flex gap-2">
            <select
              className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              value={cities.some(c => c.value === formData[fieldCity]) ? formData[fieldCity] : ""}
              onChange={async (e) => {
                const newCity = e.target.value;
                const newFormData = { ...formData, [fieldCity]: newCity };
                const coords = await fetchCoordinates(newCity, formData[fieldCountry]);
                if (coords) {
                    newFormData[fieldLat] = coords.lat;
                    newFormData[fieldLng] = coords.lng;
                }
                setFormData(newFormData);
              }}
            >
              <option value="" disabled>請選擇城市</option>
              {cities.map(city => (
                <option key={city.value} value={city.value}>{city.label}</option>
              ))}
            </select>

          <button 
            type="button"
            onClick={() => startPicking(isOrigin ? 'origin' : 'dest')}
            className={`p-2 rounded border ${formData[fieldLat] ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-100'}`}
            title="在地圖上標記位置 (同時切換國家)"
          >
            <MapPin size={20} />
          </button>
        </div>
        {formData[fieldLat] && <span className="text-xs text-green-600 flex items-center gap-1"><Check size={10} /> 已設定座標</span>}
      </div>
    );
  };

  const displayTargetCountry = getDisplayCountryName(formData.targetCountry);

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 font-sans text-gray-800">
      
      <header className="bg-blue-900 text-white p-4 shadow-md flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <Globe className="w-6 h-6" />
          <h1 className="text-xl font-bold tracking-wide">歐洲交換趴趴走</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs opacity-70 hidden sm:block">
            {loading ? '載入中...' : `已記錄 ${trips.length} 趟旅程`}
          </div>
          <button 
            onClick={() => setIsExportModalOpen(true)}
            disabled={isExporting}
            className="flex items-center gap-1 bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="匯出地圖圖片"
          >
            {isExporting ? <Loader className="animate-spin" size={16}/> : <Download size={16} />}
            <span className="hidden sm:inline">{isExporting ? '匯出中...' : '匯出地圖'}</span>
          </button>

          {!isSidebarOpen && (
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-1 rounded hover:bg-blue-800"
            >
              <Menu size={24} />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 relative overflow-hidden flex">
        
        <div 
          className={`absolute z-[1000] top-0 left-0 h-full bg-white shadow-2xl transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-full sm:w-96 flex flex-col`}
        >
          <div className="p-4 border-b flex justify-between items-center bg-gray-50">
            <h2 className="font-bold text-gray-700">旅程列表</h2>
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 rounded hover:bg-gray-200">
              <ChevronLeft size={24} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {trips.map(trip => (
                <div 
                    key={trip.id} 
                    onClick={() => openModal(trip.targetCountry, trip)}
                    className="bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow relative group cursor-pointer hover:border-blue-400"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span 
                      className="p-1.5 rounded-full text-white"
                      style={{ backgroundColor: TRANSPORT_TYPES[trip.transport]?.color || '#999' }}
                    >
                      {React.createElement(TRANSPORT_TYPES[trip.transport]?.icon || Plane, { size: 14 })}
                    </span>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      {TRANSPORT_TYPES[trip.transport]?.label}
                    </span>
                    <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                      {safeDateDisplay(trip.dateStart)} 
                      {trip.timeStart && (
                        <span className="font-mono bg-gray-100 px-1 rounded text-blue-600">
                          {trip.timeStart}{trip.timeEnd ? `-${trip.timeEnd}` : ''}
                        </span>
                      )}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm font-semibold mb-1">
                    <div className="truncate max-w-[100px]" title={trip.originCity}>{trip.originCity}</div>
                    <span className="text-gray-400">➝</span>
                    <div className="truncate max-w-[100px]" title={trip.destCity}>{trip.destCity}</div>
                  </div>

                  {trip.targetCountry && (
                    <div className="text-xs text-blue-600 mb-2 bg-blue-50 inline-block px-1.5 py-0.5 rounded">
                      {getDisplayCountryName(trip.targetCountry)}
                    </div>
                  )}

                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="p-1.5 text-gray-400 bg-gray-100 rounded-full">
                          <Edit2 size={12} />
                      </div>
                      <button 
                        onClick={(e) => requestDelete(e, trip.id)}
                        className="p-1.5 text-red-400 hover:text-red-500 bg-red-50 rounded-full hover:bg-red-100"
                        title="刪除"
                      >
                        <Trash2 size={12} />
                      </button>
                  </div>
                </div>
              ))
            }
          </div>
          
          <div className="p-4 border-t bg-gray-50">
            <button 
              onClick={() => openModal('')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg flex items-center justify-center gap-2 shadow transition-colors font-bold text-lg"
            >
              <Plus size={20} /> 新增旅程
            </button>
          </div>
        </div>

        {!isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-4 left-4 z-[500] bg-white p-2 rounded-full shadow-lg hover:bg-gray-100 hidden md:block"
          >
            <ChevronRight size={20} />
          </button>
        )}

        {isPickingMode && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-blue-600 text-white px-6 py-3 rounded-full shadow-xl animate-bounce flex items-center gap-2 pointer-events-none">
            <MapPin size={20} />
            <span className="font-bold">請在地圖上點擊位置</span>
            <span className="text-sm opacity-90 ml-2">({pickingLocationMode.current === 'origin' ? '出發地' : '目的地'})</span>
          </div>
        )}

        <div ref={captureRef} className="w-full h-full z-0 bg-slate-200 relative flex flex-col">
          {isExporting && (
            <div className="bg-blue-900 text-white p-6 text-center shadow-md">
                <h1 className="text-3xl font-bold tracking-wide mb-2">歐洲交換趴趴走</h1>
                {exportDateRangeText && (
                    <p className="text-lg opacity-90 font-mono bg-blue-800 inline-block px-3 py-1 rounded">
                        {exportDateRangeText}
                    </p>
                )}
            </div>
          )}
          
          <div ref={mapContainerRef} className="flex-1 relative" />
          
          <div className="absolute bottom-6 right-6 z-[400] bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-xl border border-gray-200">
             <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider border-b pb-1">交通方式</h4>
             <div className="space-y-2">
                 {Object.entries(TRANSPORT_TYPES).map(([key, type]) => (
                     <div key={key} className="flex items-center gap-2">
                         <div className="w-6 h-1 rounded-full" style={{ backgroundColor: type.color }}></div>
                         <span className="text-xs font-semibold text-gray-700">{type.label}</span>
                     </div>
                 ))}
             </div>
             <div className="mt-2 pt-2 border-t text-[10px] text-gray-400 text-center">
                 虛線代表未定/未來行程
             </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-0 md:p-4">
          <div className="bg-white md:rounded-xl shadow-2xl w-full max-w-2xl h-full md:h-auto md:max-h-[90vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                {editingId ? '編輯旅程細節' : '新增旅程細節'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100">
                <X size={28} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                {renderCityInput('origin')}
                {renderCityInput('dest')}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">出發時間</label>
                  <div className="flex gap-2 items-center">
                    <input type="date" className="flex-1 p-3 border rounded text-base" 
                      value={formData.dateStart} onChange={e => setFormData({...formData, dateStart: e.target.value})} />
                    
                    <TimeSelector 
                      value={formData.timeStart}
                      onChange={(val) => setFormData({...formData, timeStart: val})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">抵達時間</label>
                  <div className="flex gap-2 items-center">
                    <input type="date" className="flex-1 p-3 border rounded text-base" 
                      value={formData.dateEnd} onChange={e => setFormData({...formData, dateEnd: e.target.value})} />
                    
                    <TimeSelector 
                      value={formData.timeEnd}
                      onChange={(val) => setFormData({...formData, timeEnd: val})}
                    />
                  </div>
                  {formData.dateEnd && formData.dateStart && formData.dateEnd < formData.dateStart && (
                    <div className="text-amber-600 text-xs mt-1 flex items-center gap-1">
                      <AlertTriangle size={12}/> 
                      注意：抵達日期早於出發日期 (跨時區/換日線)
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">交通工具類型</label>
                <div className="grid grid-cols-4 gap-3">
                  {Object.entries(TRANSPORT_TYPES).map(([type, config]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({...formData, transport: type})}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${
                        formData.transport === type 
                          ? 'border-blue-500 bg-blue-50 text-blue-700' 
                          : 'border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {React.createElement(config.icon, { size: 24, className: "mb-1" })}
                      <span className="text-xs font-bold">{config.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">交通票價 / 費用</label>
                    <div className="flex gap-2">
                      <select
                        className="w-1/3 p-3 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-base"
                        value={formData.currency}
                        onChange={e => setFormData({...formData, currency: e.target.value})}
                      >
                        {CURRENCIES.map(c => (
                          <option key={c.code} value={c.code}>{c.code} ({c.label})</option>
                        ))}
                      </select>
                      <div className="relative flex-1">
                        <DollarSign size={16} className="absolute left-3 top-3.5 text-gray-400" />
                        <input 
                          type="number"
                          placeholder="金額"
                          className="w-full pl-9 p-3 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none text-base"
                          value={formData.cost} 
                          onChange={e => setFormData({...formData, cost: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">航班 / 車次 / 船班</label>
                    <div className="relative">
                      <Ticket size={16} className="absolute left-3 top-3.5 text-gray-400" />
                      <input 
                        type="text" placeholder="例如: 長榮 BR198"
                        className="w-full pl-9 p-3 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none text-base"
                        value={formData.transportNumber} onChange={e => setFormData({...formData, transportNumber: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">座位詳情</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Armchair size={16} className="absolute left-3 top-3.5 text-gray-400" />
                      <input 
                        type="text" placeholder="座位號碼 (例: 42A)"
                        className="w-full pl-9 p-3 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none text-base"
                        value={formData.seatNumber} onChange={e => setFormData({...formData, seatNumber: e.target.value})}
                      />
                    </div>
                    <select 
                      className="p-3 border rounded w-1/3 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-base"
                      value={formData.seatType}
                      onChange={e => setFormData({...formData, seatType: e.target.value})}
                    >
                      {Object.entries(SEAT_TYPES).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">備註</label>
                  <textarea 
                    placeholder="輸入其他備註..."
                    rows="3"
                    className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none text-base"
                    value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t mt-4 pb-8 md:pb-0">
                <button 
                  type="button" onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors text-base"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 text-base"
                >
                  {editingId ? '更新旅程' : '儲存旅程'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 匯出選項 Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-[2200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Download size={20} className="text-blue-600"/> 匯出地圖設定
            </h3>
            
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" name="exportMode" value="all" 
                    checked={exportMode === 'all'}
                    onChange={() => setExportMode('all')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-700">匯出全部旅程</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" name="exportMode" value="range" 
                    checked={exportMode === 'range'}
                    onChange={() => setExportMode('range')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-700">指定日期區間</span>
                </label>
              </div>

              {exportMode === 'range' && (
                <div className="bg-gray-50 p-3 rounded border space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">開始日期</label>
                    <input type="date" className="w-full p-2 border rounded text-sm" 
                      value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">結束日期</label>
                    <input type="date" className="w-full p-2 border rounded text-sm" 
                      value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                取消
              </button>
              <button 
                onClick={performExport}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded shadow transition-colors"
              >
                開始匯出
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認 Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[2100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200 text-center">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">確定要刪除這筆紀錄嗎？</h3>
            <p className="text-sm text-gray-500 mb-6">刪除後將無法復原，您確定要繼續嗎？</p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow transition-colors"
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
