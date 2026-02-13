import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, onSnapshot, query, deleteDoc, doc, serverTimestamp, orderBy, getDoc, setDoc, limit, getDocs } from 'firebase/firestore';
import { Plane, Train, Bus, Ship, Car, MapPin, DollarSign, Trash2, Plus, X, Globe, ChevronLeft, ChevronRight, Check, Armchair, FileText, Ticket, RefreshCw, AlertTriangle, Menu, Loader, Edit2, Share2, LogOut, Lock, LogIn, PlusCircle, Eye, EyeOff, Map, Calendar, Download, Image as ImageIcon, ArrowRight, Trophy, List, Share, PlusSquare } from 'lucide-react';

// 注意：我們使用 CDN 動態載入 Leaflet 與 html2canvas，以相容預覽環境與本機環境

// -----------------------------------------------------------------------------
// 0. 工具函式：計算大圓航線 (Great Circle Path)
// -----------------------------------------------------------------------------
const toRad = (d) => d * Math.PI / 180;
const toDeg = (r) => r * 180 / Math.PI;

const getGreatCirclePoints = (startLat, startLng, endLat, endLng, numPoints = 100) => {
  const points = [];
  const lat1 = toRad(startLat);
  const lon1 = toRad(startLng);
  const lat2 = toRad(endLat);
  const lon2 = toRad(endLng);

  const d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon1 - lon2) / 2), 2)));

  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    points.push([toDeg(lat), toDeg(lon)]);
  }
  return points;
};

const safeDateDisplay = (date) => {
    if (!date) return '';
    if (typeof date === 'string') return date;
    if (date?.toDate) return date.toDate().toLocaleDateString();
    return String(date);
};

const fetchCoordinates = async (city, country) => {
    // 特別處理 Merzouga (梅爾祖卡) 的座標
    if (city.includes("Merzouga") || city.includes("梅爾祖卡")) {
       // 31°04'48.2"N 4°00'42.7"W => 31.080056, -4.011861
       return { lat: 31.080056, lng: -4.011861 };
    }
    
    // 特別處理 Fes (費茲) 的座標
    if (city.includes("Fes") || city.includes("費茲")) {
          // 34.033333, -5.000000
          return { lat: 34.033333, lng: -5.000000 };
    }

    // 特別處理 馬爾他騎士團 (Sovereign Military Order of Malta) 的座標
    if (city.includes("Magistral Palace") || city.includes("馬爾他宮")) {
        // 41°54′19″N 12°28′50″E => 41.905278, 12.480556
        return { lat: 41.905278, lng: 12.480556 };
    }
    if (city.includes("Magistral Villa") || city.includes("馬爾他部")) {
        // 41°52'58.6"N 12°28'41.5"E => 41.882944, 12.478194
        return { lat: 41.882944, lng: 12.478194 };
    }

    // 特別處理 蒙地卡羅 (Monte Carlo) 的座標
    if (city.includes("Monte Carlo") || city.includes("蒙地卡羅")) {
        // 43°44'15.4"N 7°25'13.3"E => 43.737611, 7.420361
        return { lat: 43.737611, lng: 7.420361 };
    }

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

// -----------------------------------------------------------------------------
// 1. Firebase 初始化
// -----------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCFNcDaHTOx4lETnJk844Eq6EZs1AbF9_8",
  authDomain: "my-travel-map-db74a.firebaseapp.com",
  projectId: "my-travel-map-db74a",
  storageBucket: "my-travel-map-db74a.firebasestorage.app",
  messagingSenderId: "143054225690",
  appId: "1:143054225690:web:ff2d9355401cce41c02ca3"
};

let app;
let auth;
let db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase init error", e);
}
const appId = 'travel-map-v1'; 

// -----------------------------------------------------------------------------
// 2. 翻譯資料庫 (繁體中文 - 台灣慣用語) - 終極完整版
// -----------------------------------------------------------------------------
const COUNTRY_TRANSLATIONS = {
  // === 亞洲 (Asia) ===
  "Taiwan": "台灣", "Japan": "日本", "South Korea": "韓國", "Korea, South": "韓國", "China": "中國",
  "Hong Kong": "香港", "Macao": "澳門", "Singapore": "新加坡", "Malaysia": "馬來西亞",
  "Thailand": "泰國", "Vietnam": "越南", "Philippines": "菲律賓", "Indonesia": "印尼",
  "India": "印度", "Cambodia": "柬埔寨", "Myanmar": "緬甸", "Laos": "寮國",
  "Mongolia": "蒙古", "Nepal": "尼泊爾", "Sri Lanka": "斯里蘭卡", "Maldives": "馬爾地夫",
  "Brunei": "汶萊", "Timor-Leste": "東帝汶", "Bhutan": "不丹", "Bangladesh": "孟加拉",
  "Pakistan": "巴基斯坦", "Afghanistan": "阿富汗",
  "Kazakhstan": "哈薩克", "Uzbekistan": "烏茲別克", "Turkmenistan": "土庫曼", 
  "Kyrgyzstan": "吉爾吉斯", "Tajikistan": "塔吉克",

  // === 歐洲 (Europe) - 包含所有微型國家與屬地 ===
  "Albania": "阿爾巴尼亞", "Andorra": "安道爾", "Armenia": "亞美尼亞", "Austria": "奧地利", 
  "Azerbaijan": "亞塞拜然", "Belarus": "白俄羅斯", "Belgium": "比利時", 
  "Bosnia and Herzegovina": "波士尼亞與赫塞哥維納", "Bulgaria": "保加利亞", 
  "Croatia": "克羅埃西亞", "Cyprus": "賽普勒斯", "Czech Republic": "捷克", 
  "Denmark": "丹麥", "Estonia": "愛沙尼亞", "Faroe Islands": "法羅群島", 
  "Finland": "芬蘭", "France": "法國", "Georgia": "喬治亞", "Germany": "德國", 
  "Gibraltar": "直布羅陀", "Greece": "希臘", "Hungary": "匈牙利", "Iceland": "冰島", 
  "Ireland": "愛爾蘭", "Italy": "義大利", "Kosovo": "科索沃", "Latvia": "拉脫維亞", 
  "Liechtenstein": "列支敦斯登", "Lithuania": "立陶宛", "Luxembourg": "盧森堡", 
  "Malta": "馬爾他", "Moldova": "摩爾多瓦", "Monaco": "摩納哥", "Montenegro": "蒙特內哥羅", 
  "Netherlands": "荷蘭", "North Macedonia": "北馬其頓", "Norway": "挪威", "Poland": "波蘭", 
  "Portugal": "葡萄牙", "Romania": "羅馬尼亞", "Russia": "俄羅斯", "San Marino": "聖馬利諾", 
  "Serbia": "塞爾維亞", "Slovakia": "斯洛伐克", "Slovenia": "斯洛維尼亞", "Spain": "西班牙", 
  "Sweden": "瑞典", "Switzerland": "瑞士", "Turkey": "土耳其", "Ukraine": "烏克蘭", 
  "United Kingdom": "英國", "Vatican City": "梵蒂岡", "Jersey": "澤西島", "Guernsey": "根西島",
  "Isle of Man": "曼島", "England": "英國",
  "Sovereign Military Order of Malta": "馬爾他騎士團",

  // === 中東與北非 (MENA) ===
  "Algeria": "阿爾及利亞", "Bahrain": "巴林", "Egypt": "埃及", "Iran": "伊朗", "Iraq": "伊拉克", 
  "Israel": "以色列", "Jordan": "約旦", "Kuwait": "科威特", "Lebanon": "黎巴嫩", "Libya": "利比亞", 
  "Morocco": "摩洛哥", "Oman": "阿曼", "Palestine": "巴勒斯坦", "Qatar": "卡達", 
  "Saudi Arabia": "沙烏地阿拉伯", "Syria": "敘利亞", "Tunisia": "突尼西亞", 
  "United Arab Emirates": "阿拉伯聯合大公國", "Yemen": "葉門", "Western Sahara": "西撒哈拉",

  // === 美洲 (Americas) ===
  "United States": "美國", "Canada": "加拿大", "Mexico": "墨西哥", "Brazil": "巴西", 
  "Argentina": "阿根廷", "Chile": "智利", "Peru": "秘魯", "Colombia": "哥倫比亞",
  "Bolivia": "玻利維亞", "Ecuador": "厄瓜多", "Paraguay": "巴拉圭", "Uruguay": "烏拉圭",
  "Venezuela": "委內瑞拉", "Cuba": "古巴", "Jamaica": "牙買加", "Costa Rica": "哥斯大黎加",
  "Panama": "巴拿馬", "Bahamas": "巴哈馬", "Dominican Republic": "多明尼加", "Haiti": "海地",
  "Belize": "貝里斯", "Guatemala": "瓜地馬拉", "Honduras": "宏都拉斯", "El Salvador": "薩爾瓦多",
  "Nicaragua": "尼加拉瓜", "USA": "美國",

  // === 大洋洲 (Oceania) ===
  "Australia": "澳洲", "New Zealand": "紐西蘭", "Fiji": "斐濟", "Palau": "帛琉", "Guam": "關島",
  "Papua New Guinea": "巴布亞紐幾內亞", "Solomon Islands": "索羅門群島", "Vanuatu": "萬那杜",

  // === 非洲其他 (Sub-Saharan Africa) ===
  "South Africa": "南非", "Kenya": "肯亞", "Tanzania": "坦尚尼亞", "Ethiopia": "衣索比亞", 
  "Nigeria": "奈及利亞", "Ghana": "迦納", "Madagascar": "馬達加斯加", "Sudan": "蘇丹"
};

const CITY_TRANSLATIONS = {
  // 北馬其頓 (North Macedonia)
  "Skopje": "史科普耶", "Ohrid": "奧赫里德", "Bitola": "比托拉", "Kumanovo": "庫馬諾沃", 
  "Prilep": "普里萊普", "Tetovo": "泰托沃", "Veles": "韋萊斯", "Stip": "什蒂普", 
  "Gostivar": "戈斯蒂瓦爾", "Strumica": "斯特魯米察", "Kavadarci": "卡瓦達爾奇",

  // 摩洛哥 (Morocco) - 包含 Merzouga
  "Merzouga": "梅爾祖卡", "Casablanca": "卡薩布蘭卡", "Rabat": "拉巴特", "Marrakech": "馬拉喀什", 
  "Fes": "費茲", "Tangier": "丹吉爾", "Chefchaouen": "舍夫沙萬", "Essaouira": "索維拉", "Ouarzazate": "瓦爾扎扎特",

  // 台灣
  "Taipei": "台北", "Kaohsiung": "高雄", "Taichung": "台中", "Tainan": "台南", "Taoyuan": "桃園", "Hsinchu": "新竹",
  
  // 歐洲熱門
  "Paris": "巴黎", "Lyon": "里昂", "Nice": "尼斯", "Marseille": "馬賽",
  "Berlin": "柏林", "Munich": "慕尼黑", "Frankfurt": "法蘭克福", "Hamburg": "漢堡",
  "London": "倫敦", "Edinburgh": "愛丁堡", "Manchester": "曼徹斯特", "Liverpool": "利物浦",
  "Rome": "羅馬", "Milan": "米蘭", "Venice": "威尼斯", "Florence": "佛羅倫斯", "Naples": "拿坡里",
  "Madrid": "馬德里", "Barcelona": "巴塞隆納", "Seville": "塞維亞", "Valencia": "瓦倫西亞",
  "Amsterdam": "阿姆斯特丹", "Rotterdam": "鹿特丹", "Brussels": "布魯塞爾", "Bruges": "布魯日",
  "Zurich": "蘇黎世", "Geneva": "日內瓦", "Vienna": "維也納", "Salzburg": "薩爾斯堡", "Hallstatt": "哈爾施塔特",
  "Prague": "布拉格", "Cesky Krumlov": "庫倫洛夫", "Budapest": "布達佩斯", "Warsaw": "華沙", "Krakow": "克拉科夫",
  "Stockholm": "斯德哥爾摩", "Copenhagen": "哥本哈根", "Oslo": "奧斯陸", "Helsinki": "赫爾辛基", "Athens": "雅典",
  "New York": "紐約", "Los Angeles": "洛杉磯", "San Francisco": "舊金山", "Toronto": "多倫多", "Vancouver": "溫哥華",
  "Sydney": "雪梨", "Melbourne": "墨爾本", "Bangkok": "曼谷", "Singapore": "新加坡",
  
  // 馬爾他騎士團
  "Magistral Palace": "馬爾他宮", "Magistral Villa": "馬爾他部",
  
  // 摩納哥
  "Monte Carlo": "蒙地卡羅"
};

const PREDEFINED_CITIES = {
  "North Macedonia": ["Skopje", "Ohrid", "Bitola", "Kumanovo", "Prilep", "Tetovo", "Veles", "Stip", "Gostivar", "Strumica"],
  "Kosovo": ["Pristina", "Prizren", "Peja", "Gjakova", "Mitrovica"],
  "Montenegro": ["Podgorica", "Kotor", "Budva", "Bar", "Herceg Novi", "Tivat"],
  "Taiwan": ["Taipei", "Kaohsiung", "Taichung", "Tainan", "Taoyuan", "Hsinchu", "Keelung", "Chiayi", "Hualien", "Taitung"],
  "Bosnia and Herzegovina": ["Sarajevo", "Mostar", "Banja Luka", "Tuzla", "Zenica"],
  "Albania": ["Tirana", "Durres", "Vlore", "Shkoder", "Sarande"],
  "Morocco": ["Merzouga", "Casablanca", "Rabat", "Marrakech", "Fes", "Tangier", "Chefchaouen", "Essaouira", "Ouarzazate"],
  "Sovereign Military Order of Malta": ["Magistral Palace", "Magistral Villa"],
  "Monaco": ["Monte Carlo"],
};

// 格式化顯示名稱：中文 (英文)
const getDisplayCityName = (englishName) => {
  if (!englishName) return '';
  const cleanName = englishName.replace(' City', '').trim();
  const chinese = CITY_TRANSLATIONS[cleanName] || CITY_TRANSLATIONS[englishName];
  return chinese ? `${chinese} (${englishName})` : englishName;
};

const getDisplayCountryName = (englishName) => {
    const chinese = COUNTRY_TRANSLATIONS[englishName];
    return chinese ? `${chinese} (${englishName})` : englishName;
};

// -----------------------------------------------------------------------------
// 3. 常數與設定
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

// OSRM 路徑抓取 - 更新為支援多點 (transit)
const fetchRoutePath = async (lat1, lng1, lat2, lng2, transitLat = null, transitLng = null) => {
    try {
        let coordsString = `${lng1},${lat1}`;
        if (transitLat && transitLng) {
            coordsString += `;${transitLng},${transitLat}`;
        }
        coordsString += `;${lng2},${lat2}`;

        // 使用 HTTPS 避免 Mixed Content
        const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('OSRM Network response was not ok');
        const data = await res.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            // 注意：Leaflet 需要 [lat, lng]，OSRM 回傳 [lng, lat]
            return data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
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

export default function TravelMapApp() {
  const [user, setUser] = useState(null);
  const [trips, setTrips] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  
  // ★★★ 修正：預設只在寬螢幕 (電腦) 展開側邊欄，手機版預設隱藏，避免擋住地圖 ★★★
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [allCountries, setAllCountries] = useState([]);
  const [originCities, setOriginCities] = useState([]);
  const [destCities, setDestCities] = useState([]);
  const [transitCities, setTransitCities] = useState([]); // 新增
  const [isLoadingOriginCities, setIsLoadingOriginCities] = useState(false);
  const [isLoadingDestCities, setIsLoadingDestCities] = useState(false);
  const [isLoadingTransitCities, setIsLoadingTransitCities] = useState(false); // 新增
  
  // 手動輸入模式
  const [isOriginManual, setIsOriginManual] = useState(false);
  const [isDestManual, setIsDestManual] = useState(false);
  const [isTransitManual, setIsTransitManual] = useState(false); // 新增
  
  const [libLoaded, setLibLoaded] = useState(false);
  const [isPickingMode, setIsPickingMode] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // ★★★ ID & 密碼 相關狀態 ★★★
  const [currentMapId, setCurrentMapId] = useState('');
  const [isIdModalOpen, setIsIdModalOpen] = useState(true); 
  const [tempMapIdInput, setTempMapIdInput] = useState(''); 
  const [tempPasswordInput, setTempPasswordInput] = useState('');
  const [idMode, setIdMode] = useState('enter'); 
  const [idError, setIdError] = useState('');
  const [isCheckingId, setIsCheckingId] = useState(false);
  const [showPassword, setShowPassword] = useState(false); 
  const [rememberMe, setRememberMe] = useState(false); 
  
  // ★★★ 匯出相關狀態 ★★★
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [showExportPreview, setShowExportPreview] = useState(false); 
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [isCapturing, setIsCapturing] = useState(false); 

  // 統計數據
  const [stats, setStats] = useState({ countries: 0, cities: 0 });
  const [detailedStats, setDetailedStats] = useState({ countryList: [], cityList: [] }); // 新增詳細列表
  const [showMobileStats, setShowMobileStats] = useState(false); // 控制手機版統計卡片
  const [isStatsListOpen, setIsStatsListOpen] = useState(false); // 新增：控制統計列表 Modal

  // ★★★ PWA 安裝提示狀態 ★★★
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null); // 用於儲存 Android/Desktop 的安裝事件

  const [formData, setFormData] = useState({
    originCountry: '', originCity: '', originLat: null, originLng: null,
    destCountry: '', destCity: '', destLat: null, destLng: null,
    transitCountry: '', transitCity: '', transitLat: null, transitLng: null, // 新增轉機資訊
    dateStart: '', timeStart: '', dateEnd: '', timeEnd: '',
    transport: 'plane', cost: '', currency: 'EUR',
    transportNumber: '', seatNumber: '', seatType: '', notes: '',
    targetCountry: '', routePath: null
  });

  const mapContainerRef = useRef(null);
  const exportPreviewRef = useRef(null); 
  const mapInstanceRef = useRef(null);
  const geoJsonLayerRef = useRef(null);
  const layersRef = useRef([]); 
  const pickerMarkerRef = useRef(null);
  const pickingLocationMode = useRef(null);
  const latestDataRef = useRef({ trips: [], allCountries: [] });
  
  // 用於高亮邏輯 (排除 Transit, 排除 Taiwan)
  const visitedCountriesRef = useRef(new Set()); 

  // ★★★ PWA 安裝偵測 Effect (整合 iOS 與 Android/Desktop) ★★★
  useEffect(() => {
    // 1. iOS 偵測邏輯
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    // 使用 matchMedia 進行更標準的檢查，並相容舊版 iOS navigator.standalone
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    
    if (isIOS && !isStandalone) {
        // iOS 延遲顯示教學
        setTimeout(() => setShowInstallPrompt(true), 3000);
    }

    // 2. Android / Desktop Chrome 安裝事件偵測
    const handleBeforeInstallPrompt = (e) => {
      // 阻止 Chrome 預設的迷你資訊列出現
      e.preventDefault();
      // 將事件儲存起來，以便稍後由使用者觸發
      setDeferredPrompt(e);
      // 顯示我們的自訂安裝提示 UI
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // 處理 Android/Desktop 安裝點擊
  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    // 顯示原生安裝提示
    deferredPrompt.prompt();
    // 等待使用者回應
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    }
  };

  useEffect(() => {
    latestDataRef.current = { trips, allCountries };
    // 更新去過的國家 Set (過濾掉轉機國、台灣)
    
    // ★★★ 修正：使用當地時間，避免時區問題導致當天行程不顯示 ★★★
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    const activeTrips = trips.filter(t => t.dateStart && t.dateStart <= today);
    const countries = new Set();
    const cities = new Set(); // 使用 Set 避免重複: "City, Country"

    activeTrips.forEach(t => {
        if (t.targetCountry) countries.add(t.targetCountry);
        if (t.destCountry) countries.add(t.destCountry);
        if (t.originCountry) countries.add(t.originCountry);
        
        // 統計城市 (排除轉機)
        if (t.originCity && t.originCountry !== 'Taiwan') cities.add(`${t.originCity} (${t.originCountry})`);
        if (t.destCity && t.destCountry !== 'Taiwan') cities.add(`${t.destCity} (${t.destCountry})`);
    });

    // 移除台灣
    countries.delete('Taiwan');
    
    // 更新 Ref 用於地圖繪製
    visitedCountriesRef.current = countries;
    
    // 更新顯示統計
    setStats({
        countries: countries.size,
        cities: cities.size
    });
    
    // 更新詳細列表
    setDetailedStats({
        countryList: Array.from(countries).sort().map(c => getDisplayCountryName(c)),
        cityList: Array.from(cities).sort()
    });

  }, [trips, allCountries]);

  // ★★★ 初始化：檢查網址與 LocalStorage (修正：確保能自動登入) ★★★
  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const mapIdFromUrl = params.get('map');
      const storedAuthStr = localStorage.getItem('travel_map_auth');
      
      let initialId = '';
      let initialPass = '';
      let initialRemember = false;

      if (storedAuthStr) {
          try {
              const stored = JSON.parse(storedAuthStr);
              initialId = stored.id;
              initialPass = stored.password;
              initialRemember = true;
          } catch (e) { console.error(e); }
      }

      // 如果網址有 ID，以此為主，但若與儲存的 ID 不同，則不預填密碼 (安全考量)
      if (mapIdFromUrl) {
          if (initialId !== mapIdFromUrl) {
              initialPass = ''; 
              initialRemember = false; 
          }
          initialId = mapIdFromUrl;
      }

      if (initialId) {
          setTempMapIdInput(initialId);
          setIdMode('enter');
          
          // ★★★ 關鍵修正：如果沒有網址 ID (代表是自己開)，且有儲存的憑證，直接設定 currentMapId 以自動登入
          if (!mapIdFromUrl && initialPass && initialRemember) {
              setCurrentMapId(initialId);
          }
      }
      
      if (initialPass) setTempPasswordInput(initialPass);
      if (initialRemember) setRememberMe(true);
      
      setIsIdModalOpen(true);
      
      // 安全清除：移除任何可能殘留的匯出隱形圖層
      const oldWrappers = document.querySelectorAll('div[style*="z-index: 9999"]');
      oldWrappers.forEach(el => {
          if (el.style.width === '0px' && el.style.height === '0px') {
              el.remove();
          }
      });
  }, []);

  // ★★★ 處理 ID 與密碼提交 ★★★
  const handleIdSubmit = useCallback(async (e) => {
      e.preventDefault();
      setIdError('');
      
      const cleanId = tempMapIdInput.trim().replace(/[^a-zA-Z0-9-_]/g, ''); 
      const password = tempPasswordInput.trim();

      if (!cleanId) { setIdError("請輸入有效的 ID (英文、數字)"); return; }
      if (!password || !/^\d{4,6}$/.test(password)) { setIdError("請輸入 4-6 位數字密碼"); return; }

      setIsCheckingId(true);
      
      const authDocRef = doc(db, 'artifacts', appId, 'users', cleanId, 'settings', 'auth');

      try {
          const authSnap = await getDoc(authDocRef);

          if (idMode === 'create') {
              if (authSnap.exists()) {
                  setIdError("此 ID 已被使用，請更換一個");
                  setIsCheckingId(false);
                  return;
              } else {
                  const tripQ = query(collection(db, 'artifacts', appId, 'users', cleanId, 'travel_trips'), limit(1));
                  const tripSnap = await getDocs(tripQ);
                  if (!tripSnap.empty) {
                      setIdError("此 ID 已被使用 (舊版地圖)，請更換 ID");
                      setIsCheckingId(false);
                      return;
                  }

                  await setDoc(authDocRef, { 
                      password: password,
                      createdAt: serverTimestamp()
                  });
              }
          } else {
              if (authSnap.exists()) {
                  const storedData = authSnap.data();
                  if (storedData.password !== password) {
                      setIdError("密碼錯誤，請重試");
                      setIsCheckingId(false);
                      return;
                  }
              } else {
                  const tripQ = query(collection(db, 'artifacts', appId, 'users', cleanId, 'travel_trips'), limit(1));
                  const tripSnap = await getDocs(tripQ);
                  if (tripSnap.empty) {
                       setIdError("找不到此地圖 ID");
                       setIsCheckingId(false);
                       return;
                  }
              }
          }

          // ★★★ 記住密碼邏輯修正 ★★★
          if (rememberMe) {
              localStorage.setItem('travel_map_auth', JSON.stringify({ id: cleanId, password: password }));
          } else {
              localStorage.removeItem('travel_map_auth');
          }

          setCurrentMapId(cleanId);
          setIsIdModalOpen(false);
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('map', cleanId);
          
          try {
             window.history.pushState({}, '', newUrl);
          } catch (historyErr) {
             console.warn("Could not update URL (expected in preview):", historyErr);
          }

      } catch (err) {
          console.error("Auth check error:", err);
          setIdError("連線錯誤，請稍後再試");
      }
      
      setIsCheckingId(false);
  }, [idMode, rememberMe, tempMapIdInput, tempPasswordInput]);

  const handleShare = useCallback(() => {
      const url = window.location.href;
      navigator.clipboard.writeText(url).then(() => {
          alert(`網址已複製！\n請記得將您的「地圖 ID」和「密碼」告訴朋友，他們才能編輯喔！\n\n網址：${url}`);
      });
  }, []);

  const handleSwitchMap = useCallback(() => {
      const confirmSwitch = window.confirm("確定要登出並切換地圖嗎？");
      if (confirmSwitch) {
          // 不清除 localStorage，除非使用者手動取消勾選
          // localStorage.removeItem('travel_map_auth'); 
          window.location.reload(); 
      }
  }, []);

  // CDN 載入
  useEffect(() => {
    const loadScript = (src, id) => {
        if (document.getElementById(id)) return;
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.async = true;
        document.body.appendChild(script);
    };
    const loadStyle = (href, id) => {
        if (document.getElementById(id)) return;
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    };

    loadStyle('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'leaflet-css');
    loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'leaflet-js');
    loadScript('https://html2canvas.hertzen.com/dist/html2canvas.min.js', 'html2canvas-js');

    const checkLibs = setInterval(() => {
        if (window.L && window.html2canvas) {
            setLibLoaded(true);
            clearInterval(checkLibs);
            
            delete window.L.Icon.Default.prototype._getIconUrl;
            window.L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            });
        }
    }, 500);
    return () => clearInterval(checkLibs);
  }, []);

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

  // ★★★ 監聽資料庫：只監聽當前 mapId ★★★
  useEffect(() => {
    if (!user || !currentMapId) return; // 沒 ID 不動作

    const q = query(collection(db, 'artifacts', appId, 'users', currentMapId, 'travel_trips'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const loadedTrips = snapshot.docs.map(doc => {
            const data = doc.data();
            let parsedRoute = null;
            if (data.routePath) {
                try {
                    parsedRoute = typeof data.routePath === 'string' ? JSON.parse(data.routePath) : data.routePath;
                } catch(e) { console.error("Parse error", e); }
            }
            return { id: doc.id, ...data, routePath: parsedRoute };
        });
        setTrips(loadedTrips);
        setLoading(false);
      },
      (error) => {
        // Fallback for missing index
        const fallbackQ = collection(db, 'artifacts', appId, 'users', currentMapId, 'travel_trips');
        onSnapshot(fallbackQ, (snap) => {
            const loaded = snap.docs.map(doc => {
                const data = doc.data();
                let parsedRoute = null;
                if (data.routePath) {
                    try {
                        parsedRoute = typeof data.routePath === 'string' ? JSON.parse(data.routePath) : data.routePath;
                    } catch(e) { console.error("Parse error", e); }
                }
                return { id: doc.id, ...data, routePath: parsedRoute };
            });
            loaded.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setTrips(loaded);
            setLoading(false);
        });
      }
    );
    return () => unsubscribe();
  }, [user, currentMapId]);

  useEffect(() => {
    const countries = Object.entries(COUNTRY_TRANSLATIONS).map(([key, value]) => ({
        name: key,
        label: `${value} (${key})`
    }));
    countries.sort((a, b) => {
        if (a.name === "Taiwan") return -1;
        if (b.name === "Taiwan") return 1;
        if (a.name === "Hungary") return -1;
        if (b.name === "Hungary") return 1;
        return a.name.localeCompare(b.name);
    });
    setAllCountries(countries);
  }, []);

  // ★★★ 4. 地圖預覽與繪製邏輯 (徹底重寫) ★★★
  useEffect(() => {
    if (!showExportPreview || !exportPreviewRef.current || !window.L) return;

    // 清除舊的內容
    exportPreviewRef.current.innerHTML = '';
    
    // 建立一個 1200x900 的容器
    const container = document.createElement('div');
    container.style.width = '1200px';
    container.style.height = '900px';
    container.style.backgroundColor = '#f1f5f9';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.fontFamily = 'sans-serif';
    container.style.position = 'absolute'; // 讓它在預覽框內絕對定位
    // 使用 scale 讓這個大容器塞進預覽視窗
    container.style.transform = 'scale(0.4)'; // 縮小以預覽
    container.style.transformOrigin = 'top left';
    exportPreviewRef.current.appendChild(container);

    // 建立標頭
    const header = document.createElement('div');
    header.style.padding = '20px';
    header.style.backgroundColor = '#1e3a8a';
    header.style.color = 'white';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    let dateRangeText = "全部時段";
    if (exportStartDate && exportEndDate) {
        dateRangeText = `${exportStartDate} 至 ${exportEndDate}`;
    }

    header.innerHTML = `
        <div>
            <h1 style="margin:0; font-size: 28px; font-weight: bold;">🗺️歐洲交換趴趴走</h1>
            <p style="margin:5px 0 0 0; opacity: 0.8; font-size: 16px;">地圖 ID: ${currentMapId}</p>
        </div>
        <div style="text-align: right;">
            <p style="margin:0; font-size: 18px; font-weight: bold;">旅程日期範圍</p>
            <p style="margin:5px 0 0 0; font-family: monospace; font-size: 18px;">${dateRangeText}</p>
        </div>
    `;
    container.appendChild(header);

    const mapWrapper = document.createElement('div');
    mapWrapper.style.flex = '1';
    mapWrapper.style.position = 'relative';
    container.appendChild(mapWrapper);

    const mapDiv = document.createElement('div');
    mapDiv.style.width = '100%';
    mapDiv.style.height = '100%';
    mapWrapper.appendChild(mapDiv);

    const L = window.L;
    const exportMap = L.map(mapDiv, {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
        fadeAnimation: false,
        zoomAnimation: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        crossOrigin: 'anonymous', // 重要：允許跨域截圖
        attribution: ''
    }).addTo(exportMap);

    // 篩選資料
    let filteredTrips = trips;
    if (exportStartDate && exportEndDate) {
        filteredTrips = trips.filter(t => {
            if (!t.dateStart) return false;
            return t.dateStart >= exportStartDate && t.dateStart <= exportEndDate;
        });
    }

    // ★★★ 匯出用的統計資料計算 ★★★
    const exportStats = { countries: 0, cities: 0 };
    const exportCountriesSet = new Set();
    const exportCitiesSet = new Set();
    
    filteredTrips.forEach(t => {
        if (t.originCountry) exportCountriesSet.add(t.originCountry);
        if (t.destCountry) exportCountriesSet.add(t.destCountry);
        if (t.targetCountry) exportCountriesSet.add(t.targetCountry);
        
        if (t.originCity && t.originCountry !== 'Taiwan') exportCitiesSet.add(`${t.originCity},${t.originCountry}`);
        if (t.destCity && t.destCountry !== 'Taiwan') exportCitiesSet.add(`${t.destCity},${t.destCountry}`);
    });
    exportCountriesSet.delete('Taiwan');
    exportStats.countries = exportCountriesSet.size;
    exportStats.cities = exportCitiesSet.size;

    // ★★★ 建立匯出圖上的統計卡片 (手動 DOM) ★★★
    const statsCard = document.createElement('div');
    statsCard.style.position = 'absolute';
    statsCard.style.top = '20px';
    statsCard.style.right = '20px';
    statsCard.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    statsCard.style.padding = '15px';
    statsCard.style.borderRadius = '12px';
    statsCard.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.2)';
    statsCard.style.zIndex = '1000';
    statsCard.style.fontFamily = 'sans-serif';
    statsCard.style.minWidth = '160px';
    statsCard.style.border = '1px solid rgba(255, 255, 255, 0.5)';
    statsCard.style.backdropFilter = 'blur(4px)';

    statsCard.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">
            <div style="background-color: #fef9c3; padding: 6px; border-radius: 9999px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                    <path d="M4 22h16"></path>
                    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
                </svg>
            </div>
            <span style="font-weight: bold; color: #374151; font-size: 14px;">旅程足跡</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 12px; color: #6b7280;">已造訪國家</span>
                <span style="font-weight: bold; font-size: 18px; color: #2563eb;">${exportStats.countries}</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 12px; color: #6b7280;">已造訪城市</span>
                <span style="font-weight: bold; font-size: 18px; color: #4f46e5;">${exportStats.cities}</span>
            </div>
        </div>
    `;
    // 將卡片加入 mapWrapper，使其位於地圖之上
    mapWrapper.appendChild(statsCard);


    // 加入 GeoJSON (國界)
    // 使用 fetch 確保載入，並處理錯誤
    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
        .then(res => {
            if (!res.ok) throw new Error('Network response was not ok');
            return res.json();
        })
        .then(data => {
            // ★★★ 修正：只計算「篩選後的行程」所涉及的國家 ★★★
            const visitedCountriesForExport = new Set();
            filteredTrips.forEach(t => {
                if (t.originCountry) visitedCountriesForExport.add(t.originCountry);
                if (t.destCountry) visitedCountriesForExport.add(t.destCountry);
                if (t.targetCountry) visitedCountriesForExport.add(t.targetCountry);
                // 注意：依照需求，不加入 transitCountry
            });
            // 依照慣例移除台灣 (視為 Home)
            visitedCountriesForExport.delete('Taiwan');
            
            const geoJsonLayer = L.geoJSON(data, {
                style: { fillColor: '#cbd5e1', weight: 1, opacity: 1, color: 'white', fillOpacity: 0.5 },
                onEachFeature: (feature, layer) => {
                    let countryName = feature.properties.name || feature.properties.ADMIN;
                    
                    const nameMapping = {
                        "USA": "United States",
                        "United States of America": "United States",
                        "England": "United Kingdom",
                        "UK": "United Kingdom",
                        "Korea, South": "South Korea",
                        "South Korea": "South Korea",
                        "People's Republic of China": "China",
                        "Republic of Serbia": "Serbia",
                        "The Bahamas": "Bahamas"
                    };
                    
                    if (nameMapping[countryName]) {
                        countryName = nameMapping[countryName];
                    }

                    if (visitedCountriesForExport.has(countryName)) {
                        layer.setStyle({ fillColor: '#fcd34d', fillOpacity: 0.8, weight: 1 });
                    }
                }
            }).addTo(exportMap);
            geoJsonLayer.bringToBack();
        })
        .catch(err => {
            console.error("GeoJSON load failed:", err);
        });

    const bounds = L.latLngBounds();
    let hasData = false;

    const today = new Date().toISOString().split('T')[0];

    filteredTrips.forEach(trip => {
      if (trip.originLat && trip.originLng && trip.destLat && trip.destLng) {
        const typeConfig = TRANSPORT_TYPES[trip.transport] || TRANSPORT_TYPES.plane;
        const isFutureOrNoDate = !trip.dateStart || trip.dateStart > today;
        const lineOptions = { 
            color: typeConfig.color, 
            weight: 4, 
            opacity: 0.8,
            dashArray: isFutureOrNoDate ? '10, 10' : null 
        };
        
        let polyline;
        
        // 處理有轉機的情況
        if (trip.transitLat && trip.transitLng) {
            // 第一段：起點 -> 轉運點
            if (trip.transport === 'plane') {
                const curvedPoints1 = getGreatCirclePoints(trip.originLat, trip.originLng, trip.transitLat, trip.transitLng);
                L.polyline(curvedPoints1, lineOptions).addTo(exportMap);
                const curvedPoints2 = getGreatCirclePoints(trip.transitLat, trip.transitLng, trip.destLat, trip.destLng);
                polyline = L.polyline(curvedPoints2, lineOptions).addTo(exportMap);
            } else if (typeConfig.useRoute && trip.routePath && trip.routePath.length > 0) {
                polyline = L.polyline(trip.routePath, lineOptions).addTo(exportMap);
            } else {
                L.polyline([[trip.originLat, trip.originLng], [trip.transitLat, trip.transitLng]], lineOptions).addTo(exportMap);
                polyline = L.polyline([[trip.transitLat, trip.transitLng], [trip.destLat, trip.destLng]], lineOptions).addTo(exportMap);
            }
            bounds.extend([trip.transitLat, trip.transitLng]);
        } else {
            // 無轉機
            if (trip.transport === 'plane') {
                 const curvedPoints = getGreatCirclePoints(trip.originLat, trip.originLng, trip.destLat, trip.destLng);
                 polyline = L.polyline(curvedPoints, lineOptions).addTo(exportMap);
            } else if (typeConfig.useRoute && trip.routePath && trip.routePath.length > 0) {
                polyline = L.polyline(trip.routePath, lineOptions).addTo(exportMap);
            } else {
                polyline = L.polyline([[trip.originLat, trip.originLng], [trip.destLat, trip.destLng]], lineOptions).addTo(exportMap);
            }
        }
        
        if (polyline) polyline.bringToFront();

        bounds.extend([trip.originLat, trip.originLng]);
        bounds.extend([trip.destLat, trip.destLng]);
        hasData = true;

        L.circleMarker([trip.originLat, trip.originLng], { radius: 5, color: typeConfig.color, fillOpacity: 1 }).addTo(exportMap);
        L.circleMarker([trip.destLat, trip.destLng], { radius: 5, color: typeConfig.color, fillOpacity: 1 }).addTo(exportMap);
      }
    });

    if (hasData && bounds.isValid()) {
        // ★★★ 修正：增加 padding 讓點與線不要貼死邊緣 (原本是 [10, 10]，改為 [50, 50]) ★★★
        exportMap.fitBounds(bounds, { padding: [50, 50] });
    } else {
        exportMap.setView([48, 15], 4);
    }

    const legend = document.createElement('div');
    legend.style.padding = '15px 20px';
    legend.style.backgroundColor = 'white';
    legend.style.borderTop = '1px solid #e2e8f0';
    legend.style.display = 'flex';
    legend.style.gap = '20px';
    legend.style.justifyContent = 'center';
    
    let legendHtml = '';
    Object.entries(TRANSPORT_TYPES).forEach(([key, type]) => {
        legendHtml += `
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 24px; height: 6px; background-color: ${type.color}; border-radius: 4px;"></div>
                <span style="font-size: 14px; color: #334155; font-weight: bold;">${type.label}</span>
            </div>
        `;
    });
    legend.innerHTML = legendHtml;
    container.appendChild(legend);

    container._exportMap = exportMap;

    return () => {
        if (container._exportMap) {
            container._exportMap.remove();
        }
    };

  }, [showExportPreview, exportStartDate, exportEndDate, trips, currentMapId]);

  // ★★★ 執行截圖與下載 ★★★
  const downloadImage = useCallback(async () => {
      if (!exportPreviewRef.current) return;
      setIsCapturing(true);
      
      const container = exportPreviewRef.current.firstChild; 
      
      try {
          const clone = container.cloneNode(true);
          const originalCanvases = container.querySelectorAll('canvas');
          const clonedCanvases = clone.querySelectorAll('canvas');
          
          originalCanvases.forEach((orig, index) => {
              const dest = clonedCanvases[index];
              if (dest) {
                  const ctx = dest.getContext('2d');
                  dest.width = orig.width;
                  dest.height = orig.height;
                  ctx.drawImage(orig, 0, 0);
              }
          });

          clone.style.transform = 'none'; 
          clone.style.position = 'fixed';
          clone.style.top = '0';
          clone.style.left = '0';
          clone.style.zIndex = '-9999'; 
          document.body.appendChild(clone);

          await new Promise(r => setTimeout(r, 500));

          const canvas = await window.html2canvas(clone, {
              useCORS: true,
              scale: 2, 
              logging: false,
              allowTaint: true, 
              backgroundColor: '#f1f5f9',
              ignoreElements: (element) => element.classList.contains('leaflet-control-zoom') 
          });

          const link = document.createElement('a');
          link.download = `travel-map-export-${new Date().toISOString().split('T')[0]}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          
          document.body.removeChild(clone);
          setIsExportModalOpen(false);
          setShowExportPreview(false);

      } catch (err) {
          console.error("Screenshot error", err);
          alert("截圖失敗，請稍後再試。\n錯誤訊息: " + err.message);
      } finally {
          setIsCapturing(false);
      }
  }, []);

  const fetchCitiesForCountry = useCallback(async (country, type) => {
    if (!country) return;
    
    // 設定對應的 set function
    let setCities, setLoading, setManual;
    if (type === 'origin') {
        setCities = setOriginCities;
        setLoading = setIsLoadingOriginCities;
        setManual = setIsOriginManual;
    } else if (type === 'dest') {
        setCities = setDestCities;
        setLoading = setIsLoadingDestCities;
        setManual = setIsDestManual;
    } else if (type === 'transit') {
        setCities = setTransitCities;
        setLoading = setIsLoadingTransitCities;
        setManual = setIsTransitManual;
    }

    setLoading(true);
    setManual(false); 

    if (PREDEFINED_CITIES[country]) {
        const processedCities = PREDEFINED_CITIES[country].map(city => ({
            value: getDisplayCityName(city),
            label: getDisplayCityName(city),
            original: city
        }));
        processedCities.sort((a, b) => a.label.localeCompare(b.label));
        setCities(processedCities);
        setLoading(false);
        return;
    }

    try {
      const response = await fetch('https://countriesnow.space/api/v0.1/countries/cities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: country })
      });
      const data = await response.json();
      if (!data.error && data.data && data.data.length > 0) {
        const processedCities = data.data.map(city => ({
          value: getDisplayCityName(city),
          label: getDisplayCityName(city),
          original: city
        }));
        processedCities.sort((a, b) => a.label.localeCompare(b.label));
        setCities(processedCities);
      } else {
        setCities([]);
        setManual(true);
      }
    } catch (error) {
      setCities([]);
      setManual(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const startPicking = useCallback((type) => {
    pickingLocationMode.current = type;
    setIsModalOpen(false); 
    setIsPickingMode(true);
    const style = document.createElement('style');
    style.id = 'map-cursor-style';
    style.innerHTML = `.leaflet-container { cursor: crosshair !important; }`;
    document.head.appendChild(style);
  }, []);

  const openModal = useCallback((countryName = '', tripToEdit = null) => {
    try {
        if (mapInstanceRef.current && pickerMarkerRef.current) {
            mapInstanceRef.current.removeLayer(pickerMarkerRef.current);
            pickerMarkerRef.current = null;
        }

        if (tripToEdit) {
            setEditingId(tripToEdit.id);
            setFormData({ ...tripToEdit });
            fetchCitiesForCountry(tripToEdit.originCountry, 'origin');
            fetchCitiesForCountry(tripToEdit.destCountry, 'dest');
            if (tripToEdit.transitCountry) {
                fetchCitiesForCountry(tripToEdit.transitCountry, 'transit');
            }
        } else {
            setEditingId(null);
            
            const currentTrips = latestDataRef.current?.trips || [];
            let initOriginCountry = '';
            let initOriginCity = '';
            let initOriginLat = null;
            let initOriginLng = null;

            if (currentTrips.length > 0) {
                const sortedTrips = [...currentTrips].sort((a, b) => {
                    const dateA = a.dateEnd || a.dateStart || '0000-00-00';
                    const dateB = b.dateEnd || b.dateStart || '0000-00-00';
                    return dateB.localeCompare(dateA);
                });
                const lastTrip = sortedTrips[0];
                
                initOriginCountry = lastTrip.destCountry || lastTrip.targetCountry || '';
                initOriginCity = lastTrip.destCity || '';
                initOriginLat = lastTrip.destLat;
                initOriginLng = lastTrip.destLng;
            }

            setFormData({
            originCountry: initOriginCountry || '', 
            originCity: initOriginCity || '', 
            originLat: initOriginLat, 
            originLng: initOriginLng,
            destCountry: initOriginCountry || '', 
            destCity: '', destLat: null, destLng: null,
            transitCountry: '', transitCity: '', transitLat: null, transitLng: null, // Reset transit
            dateStart: '', timeStart: '', dateEnd: '', timeEnd: '',
            transport: 'plane', cost: '', currency: 'EUR',
            transportNumber: '', seatNumber: '', seatType: '', notes: '',
            targetCountry: countryName || '', routePath: null
            });
            
            if (initOriginCountry) {
                fetchCitiesForCountry(initOriginCountry, 'origin');
                fetchCitiesForCountry(initOriginCountry, 'dest');
            } else {
                setOriginCities([]);
                setDestCities([]);
            }
            setTransitCities([]);
        }
        setIsModalOpen(true);
    } catch (err) {
        console.error("Open Modal Error:", err);
        setEditingId(null);
        setFormData({
            originCountry: '', originCity: '', originLat: null, originLng: null,
            destCountry: '', destCity: '', destLat: null, destLng: null,
            transitCountry: '', transitCity: '', transitLat: null, transitLng: null,
            dateStart: '', timeStart: '', dateEnd: '', timeEnd: '',
            transport: 'plane', cost: '', currency: 'EUR',
            transportNumber: '', seatNumber: '', seatType: '', notes: '',
            targetCountry: '', routePath: null
        });
        setIsModalOpen(true);
    }
  }, [fetchCitiesForCountry]);

  const renderMapLayers = useCallback((tripsToRender) => {
    if (!mapInstanceRef.current || !window.L) return;
    const map = mapInstanceRef.current;
    const L = window.L;
    
    layersRef.current.forEach(layer => map.removeLayer(layer));
    layersRef.current = [];
    
    if (pickerMarkerRef.current) {
        map.removeLayer(pickerMarkerRef.current);
        pickerMarkerRef.current = null;
    }

    if (geoJsonLayerRef.current) {
        // ★★★ 高亮邏輯：使用已過濾的 Set (排除 Taiwan 與 Transit) ★★★
        const visitedCountries = visitedCountriesRef.current;
        
        geoJsonLayerRef.current.eachLayer((layer) => {
          let countryName = layer.feature.properties.name || layer.feature.properties.ADMIN;
          
          // ★★★ 關鍵修正：加入名稱對照表 (GeoJSON 名稱 -> 我們的名稱) ★★★
          const nameMapping = {
              "United States of America": "United States",
              "USA": "United States",
              "England": "United Kingdom",
              "Great Britain": "United Kingdom",
              "UK": "United Kingdom",
              "South Korea": "South Korea", 
              "Republic of Korea": "South Korea",
              "Korea, South": "South Korea",
              "People's Republic of China": "China",
              "Republic of Serbia": "Serbia",
              "The Bahamas": "Bahamas",
              "Bahamas, The": "Bahamas",
              "Myanmar": "Myanmar", 
              "Burma": "Myanmar",
              "Czech Republic": "Czech Republic",
              "Czechia": "Czech Republic",
              "Macedonia": "North Macedonia",
              "The former Yugoslav Republic of Macedonia": "North Macedonia"
          };

          if (nameMapping[countryName]) {
              countryName = nameMapping[countryName];
          }

          if (visitedCountries.has(countryName)) {
            layer.setStyle({ fillColor: '#fcd34d', fillOpacity: 0.8, weight: 1 });
          } else {
            layer.setStyle({ fillColor: '#cbd5e1', fillOpacity: 0.5 });
          }
        });
        geoJsonLayerRef.current.bringToBack();
    }

    tripsToRender.forEach(trip => {
      if (trip.originLat && trip.originLng && trip.destLat && trip.destLng) {
        const typeConfig = TRANSPORT_TYPES[trip.transport] || TRANSPORT_TYPES.plane;
        const today = new Date().toISOString().split('T')[0];
        const isFutureOrNoDate = !trip.dateStart || trip.dateStart > today;
        const lineOptions = { color: typeConfig.color, weight: 3, opacity: 0.8, dashArray: isFutureOrNoDate ? '10, 10' : null };
        
        let polyline;
        
        // ★★★ 處理轉機路徑繪製 ★★★
        if (trip.transitLat && trip.transitLng) {
            // 繪製兩段路徑
            if (trip.transport === 'plane') {
                const curvedPoints1 = getGreatCirclePoints(trip.originLat, trip.originLng, trip.transitLat, trip.transitLng);
                const p1 = L.polyline(curvedPoints1, lineOptions).addTo(map);
                const curvedPoints2 = getGreatCirclePoints(trip.transitLat, trip.transitLng, trip.destLat, trip.destLng);
                polyline = L.polyline(curvedPoints2, lineOptions).addTo(map);
                layersRef.current.push(p1);
            } else if (typeConfig.useRoute && trip.routePath && trip.routePath.length > 0) {
                polyline = L.polyline(trip.routePath, lineOptions).addTo(map);
            } else {
                const p1 = L.polyline([[trip.originLat, trip.originLng], [trip.transitLat, trip.transitLng]], lineOptions).addTo(map);
                polyline = L.polyline([[trip.transitLat, trip.transitLng], [trip.destLat, trip.destLng]], lineOptions).addTo(map);
                layersRef.current.push(p1);
            }
            // 不在轉運點加圓點 (Marker)
        } else {
            // 原有邏輯：直接路徑
            if (trip.transport === 'plane') {
                 const curvedPoints = getGreatCirclePoints(trip.originLat, trip.originLng, trip.destLat, trip.destLng);
                 polyline = L.polyline(curvedPoints, lineOptions).addTo(map);
            }
            else if (typeConfig.useRoute && trip.routePath && trip.routePath.length > 0) {
                polyline = L.polyline(trip.routePath, lineOptions).addTo(map);
            } else {
                const straightLatLngs = [[trip.originLat, trip.originLng], [trip.destLat, trip.destLng]];
                polyline = L.polyline(straightLatLngs, lineOptions).addTo(map);
            }
        }

        if (polyline) polyline.bringToFront();

        const originMarker = L.circleMarker([trip.originLat, trip.originLng], { radius: 4, color: typeConfig.color, fillOpacity: 1 }).addTo(map);
        const destMarker = L.circleMarker([trip.destLat, trip.destLng], { radius: 4, color: typeConfig.color, fillOpacity: 1 }).addTo(map);
        
        const dateDisplay = trip.dateStart ? `${safeDateDisplay(trip.dateStart)} ${trip.timeStart || ''}` : '';
        const popupContent = `
          <div class="font-sans min-w-[200px]">
            <h3 class="font-bold text-lg mb-1">${trip.originCity} ➝ ${trip.destCity}</h3>
            ${trip.transitCity ? `<div class="text-xs text-gray-500 mb-1">經由: ${trip.transitCity}</div>` : ''}
            <div class="text-sm text-gray-700 space-y-1">
              <p><span style="color:${typeConfig.color}">●</span> ${typeConfig.label} | ${dateDisplay}</p>
              ${trip.cost ? `<p>費用: ${trip.currency} ${trip.cost}</p>` : ''}
            </div>
          </div>
        `;
        
        if (polyline) polyline.bindPopup(popupContent);
        if (layersRef.current.length > 0 && layersRef.current[layersRef.current.length - 1].bindPopup) {
             // 如果有前一段路徑 (轉機)，也綁定 popup
             layersRef.current[layersRef.current.length - 1].bindPopup(popupContent);
        }

        layersRef.current.push(polyline, originMarker, destMarker);
      }
    });
  }, []);

  useEffect(() => {
    if (!loading && mapLoaded) { 
        renderMapLayers(trips);
    }
  }, [trips, loading, mapLoaded, renderMapLayers]);

  // Map Init Effect
  useEffect(() => {
    if (!libLoaded || mapInstanceRef.current || !mapContainerRef.current) return;
    const L = window.L;
    const map = L.map(mapContainerRef.current, { preferCanvas: true }).setView([48, 15], 4); 
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19, crossOrigin: true }).addTo(map);
    mapInstanceRef.current = map;
    setMapLoaded(true);

    map.on('click', (e) => {
      if (pickingLocationMode.current) {
        const { lat, lng } = e.latlng;
        // 判斷是哪一種 picking
        let fieldLat = 'originLat';
        let fieldLng = 'originLng';
        if (pickingLocationMode.current === 'dest') { fieldLat = 'destLat'; fieldLng = 'destLng'; }
        if (pickingLocationMode.current === 'transit') { fieldLat = 'transitLat'; fieldLng = 'transitLng'; }

        setFormData(prev => ({ ...prev, [fieldLat]: lat, [fieldLng]: lng }));
        
        if (pickerMarkerRef.current) map.removeLayer(pickerMarkerRef.current);
        
        let label = "出發地";
        if (pickingLocationMode.current === 'dest') label = "目的地";
        if (pickingLocationMode.current === 'transit') label = "中途轉運點";

        pickerMarkerRef.current = L.circleMarker([lat, lng], { radius: 8, color: '#f97316', fillColor: '#f97316', fillOpacity: 0.8, weight: 2 }).addTo(map).bindPopup(label).openPopup();
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
                  // 設定對應的國家欄位
                  let fieldCountry = 'originCountry';
                  let fieldCity = 'originCity';
                  if (pickingLocationMode.current === 'dest') { fieldCountry = 'destCountry'; fieldCity = 'destCity'; }
                  if (pickingLocationMode.current === 'transit') { fieldCountry = 'transitCountry'; fieldCity = 'transitCity'; }

                  setFormData(prev => ({ ...prev, [fieldCountry]: countryName, [fieldCity]: '' }));
                } else {
                  openModal(countryName);
                }
              }
            });
          }
        }).addTo(map);
        geoJsonLayerRef.current.bringToBack();
      });
  }, [libLoaded, fetchCitiesForCountry, openModal]);

  // Picking Listener
  useEffect(() => {
    if (!mapInstanceRef.current) return;
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
  }, [isPickingMode, mapLoaded]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!user) {
        alert("請先登入！");
        return;
    }
    if (!currentMapId) {
        alert("錯誤：找不到 Map ID，無法儲存。請嘗試重新登入。");
        return;
    }

    setIsSaving(true);
    
    let finalRoutePath = null;
    const transportType = TRANSPORT_TYPES[formData.transport];
    
    try {
        if (transportType && transportType.useRoute && formData.originLat && formData.originLng && formData.destLat && formData.destLng) {
            // 更新 path 抓取邏輯以支援 transit
            finalRoutePath = await fetchRoutePath(
                formData.originLat, 
                formData.originLng, 
                formData.destLat, 
                formData.destLng,
                formData.transitLat,
                formData.transitLng
            );
        }
    } catch(err) {
        console.warn("路徑抓取失敗，將使用直線代替", err);
    }
    
    const finalData = { 
        ...formData, 
        routePath: finalRoutePath ? JSON.stringify(finalRoutePath) : null 
    };

    // 使用 currentMapId 存入資料
    try {
      if (editingId) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', currentMapId, 'travel_trips', editingId), { ...finalData, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', currentMapId, 'travel_trips'), { ...finalData, createdAt: serverTimestamp() });
      }
      setIsModalOpen(false);
      if (mapInstanceRef.current && pickerMarkerRef.current) {
          mapInstanceRef.current.removeLayer(pickerMarkerRef.current);
          pickerMarkerRef.current = null;
      }
    } catch (err) { 
        console.error("Error saving trip:", err); 
        alert("儲存失敗，請檢查網路連線或權限。");
    } finally { 
        setIsSaving(false); 
    }
  }, [user, currentMapId, formData, editingId]);

  const requestDelete = useCallback((e, id) => { e.stopPropagation(); setDeleteConfirmId(id); }, []);
  const confirmDelete = useCallback(async () => {
    if (!user || !deleteConfirmId) return;
    try { await deleteDoc(doc(db, 'artifacts', appId, 'users', currentMapId, 'travel_trips', deleteConfirmId)); setDeleteConfirmId(null); } 
    catch (err) { console.error("Error deleting trip:", err); }
  }, [user, currentMapId, deleteConfirmId]);

  const renderCityInput = (type) => {
    let cities, isLoading, isManual, setManual, fieldCountry, fieldCity, fieldLat, fieldLng, label, placeholder;

    if (type === 'origin') {
        cities = originCities; isLoading = isLoadingOriginCities; isManual = isOriginManual; setManual = setIsOriginManual;
        fieldCountry = 'originCountry'; fieldCity = 'originCity'; fieldLat = 'originLat'; fieldLng = 'originLng';
        label = '出發城市/地點'; placeholder = '例如: 台北';
    } else if (type === 'dest') {
        cities = destCities; isLoading = isLoadingDestCities; isManual = isDestManual; setManual = setIsDestManual;
        fieldCountry = 'destCountry'; fieldCity = 'destCity'; fieldLat = 'destLat'; fieldLng = 'destLng';
        label = '抵達城市/地點'; placeholder = '例如: 東京';
    } else {
        // Transit
        cities = transitCities; isLoading = isLoadingTransitCities; isManual = isTransitManual; setManual = setIsTransitManual;
        fieldCountry = 'transitCountry'; fieldCity = 'transitCity'; fieldLat = 'transitLat'; fieldLng = 'transitLng';
        label = '中途轉運點 (選填)'; placeholder = '例如: 香港';
    }
    
    const currentCityValue = formData[fieldCity];
    const isCityInList = cities.some(c => c.value === currentCityValue);
    
    return (
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700 flex justify-between">
            {label}
            {isLoading && <span className="text-xs text-blue-500 font-normal flex items-center gap-1"><RefreshCw size={10} className="animate-spin"/> 載入城市中...</span>}
        </label>
        
        <div className="mb-2">
            <select
                className="w-full p-2 border rounded text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={formData[fieldCountry]}
                onChange={(e) => {
                    const newCountry = e.target.value;
                    
                    if (type === 'origin') {
                        // 既有邏輯：起點變動連動終點
                        setFormData(prev => ({ 
                             ...prev, 
                             originCountry: newCountry, originCity: '', originLat: null, originLng: null,
                             destCountry: newCountry, destCity: '', destLat: null, destLng: null
                        }));
                        fetchCitiesForCountry(newCountry, 'origin');
                        fetchCitiesForCountry(newCountry, 'dest'); 
                    } else {
                        setFormData({ ...formData, [fieldCountry]: newCountry, [fieldCity]: '', [fieldLat]: null, [fieldLng]: null }); 
                        fetchCitiesForCountry(newCountry, type);
                    }
                }}
            >
                <option value="">{type === 'transit' ? '無 (直達)' : '請選擇國家'}</option>
                {allCountries.map(c => (
                    <option key={c.name} value={c.name}>{c.label}</option>
                ))}
            </select>
        </div>

        {/* 只有在選了國家後才顯示城市選擇 */}
        {formData[fieldCountry] && (
            <div className="flex gap-2">
                {!isManual ? (
                    <select
                    className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    value={currentCityValue}
                    onChange={async (e) => {
                        if (e.target.value === 'MANUAL_ENTRY') {
                            setManual(true);
                            setFormData({ ...formData, [fieldCity]: '' });
                            return;
                        }
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
                    {!isCityInList && currentCityValue && <option value={currentCityValue}>{currentCityValue}</option>}
                    
                    {cities.map(city => (
                        <option key={city.value} value={city.value}>{city.label}</option>
                    ))}
                    <option value="MANUAL_ENTRY" className="font-bold text-blue-600 border-t">✏️ 自行輸入...</option>
                    </select>
                ) : (
                    <div className="flex-1 relative">
                        <input 
                            type="text" 
                            placeholder={placeholder}
                            className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            value={formData[fieldCity]}
                            onChange={e => setFormData({...formData, [fieldCity]: e.target.value})}
                        />
                        <button 
                            type="button"
                            onClick={() => { setManual(false); }}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-blue-600 bg-white px-2 py-1 rounded border hover:bg-gray-50"
                        >
                            選單
                        </button>
                    </div>
                )}

            <button 
                type="button"
                onClick={() => startPicking(type)}
                className={`p-2 rounded border ${formData[fieldLat] ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-100'}`}
                title="在地圖上標記位置"
            >
                <MapPin size={20} />
            </button>
            </div>
        )}
        {formData[fieldLat] && <span className="text-xs text-green-600 flex items-center gap-1"><Check size={10} /> 已設定座標</span>}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-gray-100 font-sans text-gray-800 safe-area-inset-bottom">
      
      <header className="bg-blue-900 text-white p-4 shadow-md flex items-center justify-between z-20 pt-[env(safe-area-inset-top,20px)]">
        <div className="flex items-center gap-2">
          <Map className="w-6 h-6" />
          <div>
              <h1 className="text-xl font-bold tracking-wide">🗺️歐洲交換趴趴走</h1>
              {currentMapId && (
                <div className="flex items-center gap-1 mt-1">
                    <div className="font-mono bg-blue-800 px-1.5 rounded inline-block text-xs opacity-90">ID: {currentMapId}</div>
                    <button onClick={handleShare} className="hover:text-yellow-300" title="複製連結"><Share2 size={12}/></button>
                </div>
              )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs opacity-70 hidden sm:block">
            {loading ? '載入中...' : `已記錄 ${trips.length} 趟旅程`}
          </div>
          
          <button
            onClick={() => { 
                setIsExportModalOpen(true); 
                setShowExportPreview(true); // 開啟預覽
            }}
            className="flex items-center gap-1 bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded text-sm transition-colors"
            title="匯出地圖圖片"
          >
            <Download size={16} />
            <span className="hidden sm:inline">匯出圖片</span>
          </button>

          <button 
            onClick={handleSwitchMap}
            className="flex items-center gap-1 bg-blue-800 hover:bg-blue-700 px-3 py-1.5 rounded text-sm transition-colors border border-blue-700"
            title="建立/切換地圖"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">切換地圖</span>
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
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 md:pb-4">
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
                    <div className="truncate max-w-[80px]" title={trip.originCity}>{trip.originCity}</div>
                    
                    {/* 顯示轉機資訊 */}
                    {trip.transitCity ? (
                        <>
                            <span className="text-gray-400 text-xs">➝</span>
                            <div className="bg-gray-100 px-1 rounded text-xs text-gray-600 truncate max-w-[60px]" title={`轉機: ${trip.transitCity}`}>
                                {trip.transitCity}
                            </div>
                            <span className="text-gray-400 text-xs">➝</span>
                        </>
                    ) : (
                        <span className="text-gray-400">➝</span>
                    )}

                    <div className="truncate max-w-[80px]" title={trip.destCity}>{trip.destCity}</div>
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
          
          {/* 行動裝置版按鈕懸浮修正：在桌面版為 normal flow, 手機版為 fixed bottom */}
          <div className="p-4 border-t bg-gray-50 md:static fixed bottom-0 left-0 w-full z-10 md:z-auto shadow-inner md:shadow-none pb-[env(safe-area-inset-bottom,20px)]">
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
            <span className="text-sm opacity-90 ml-2">
                ({pickingLocationMode.current === 'origin' ? '出發地' : pickingLocationMode.current === 'dest' ? '目的地' : '轉運點'})
            </span>
          </div>
        )}

        <div className="w-full h-full z-0 bg-slate-200 relative flex flex-col">
          <div ref={mapContainerRef} className="flex-1 relative" />
          
          {/* 懸浮統計卡片 (右上角) */}
          <div className="absolute top-4 right-4 z-[400] flex flex-col items-end pointer-events-none pt-[env(safe-area-inset-top,0px)]">
            
            {/* Toggle Button (Mobile Only) */}
            <button 
                onClick={() => setShowMobileStats(!showMobileStats)}
                className="pointer-events-auto md:hidden bg-white p-3 rounded-full shadow-xl text-blue-600 border border-blue-100 mb-2 hover:bg-gray-50 active:scale-95 transition-transform"
                title="顯示統計"
            >
                <Trophy size={20} />
            </button>

            {/* Stats Card */}
            <div className={`
                pointer-events-auto
                bg-white/95 backdrop-blur p-4 rounded-xl shadow-2xl border border-white/50
                transform transition-all duration-300 origin-top-right
                ${showMobileStats ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 -translate-y-4 pointer-events-none absolute right-0 top-12'}
                md:static md:scale-100 md:opacity-100 md:translate-y-0 md:pointer-events-auto
            `}>
                <div className="flex items-center justify-between gap-4 mb-3 pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className="bg-yellow-100 p-1.5 rounded-full">
                            <Trophy size={14} className="text-yellow-600" />
                        </div>
                        <span className="font-bold text-gray-700 text-sm">旅程足跡</span>
                    </div>
                    {/* 清單按鈕 */}
                    <button 
                        onClick={() => setIsStatsListOpen(true)}
                        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded transition-colors flex items-center gap-1"
                    >
                        <List size={12} /> 清單
                    </button>
                </div>
                
                <div className="space-y-3 min-w-[140px]">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">已造訪國家</span>
                        <span className="font-bold text-lg text-blue-600">{stats.countries}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">已造訪城市</span>
                        <span className="font-bold text-lg text-indigo-600">{stats.cities}</span>
                    </div>
                </div>
            </div>
          </div>

          <div className="absolute bottom-6 right-6 z-[400] bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-xl border border-gray-200 mb-[env(safe-area-inset-bottom,0px)]">
             <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider border-b pb-1">交通方式</h4>
             <div className="space-y-2">
                 <div className="grid grid-cols-5 gap-2">
                    {Object.entries(TRANSPORT_TYPES).map(([key, type]) => (
                        <div key={key} className="flex flex-col items-center gap-1">
                            <div className="w-full h-1 rounded-full" style={{ backgroundColor: type.color }}></div>
                            <span className="text-[10px] font-bold text-gray-600 text-center leading-tight">{type.label}</span>
                        </div>
                    ))}
                 </div>
             </div>
             <div className="mt-2 pt-2 border-t text-[10px] text-gray-400 text-center">
                 虛線代表未定/未來行程
             </div>
          </div>
        </div>
      </div>
      
      {/* 統計列表 Modal */}
      {isStatsListOpen && (
        <div className="fixed inset-0 z-[2200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b bg-gray-50 rounded-t-xl">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Trophy size={18} className="text-yellow-600" /> 足跡清單
                    </h3>
                    <button onClick={() => setIsStatsListOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-4 overflow-y-auto">
                    <div className="mb-6">
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">已造訪國家 ({detailedStats.countryList.length})</h4>
                        <div className="flex flex-wrap gap-2">
                            {detailedStats.countryList.map(c => (
                                <span key={c} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm border border-blue-100">
                                    {c}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">已造訪城市 ({detailedStats.cityList.length})</h4>
                        <div className="grid grid-cols-2 gap-2">
                            {detailedStats.cityList.map(c => (
                                <div key={c} className="text-sm text-gray-700 bg-gray-50 px-2 py-1.5 rounded border border-gray-100 truncate" title={c}>
                                    {c}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* 新增/編輯旅程 Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  {editingId ? <Edit2 className="text-blue-600" /> : <PlusCircle className="text-blue-600" />}
                  {editingId ? '編輯旅程' : '新增旅程'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* 地點區塊 */}
                <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100">
                    <h3 className="font-bold text-gray-600 flex items-center gap-2">
                        <MapPin size={18} /> 旅程起訖點
                    </h3>
                    
                    {/* 出發地 */}
                    {renderCityInput('origin')}
                    
                    {/* 新增：中途轉運點 (選填) */}
                    <div className="pl-4 border-l-2 border-dashed border-gray-300 ml-2 relative">
                        <div className="absolute -left-[9px] top-1/2 -translate-y-1/2 bg-gray-100 text-gray-400 rounded-full p-0.5">
                            <ArrowRight size={12} />
                        </div>
                        {renderCityInput('transit')}
                    </div>

                    {/* 目的地 */}
                    {renderCityInput('dest')}
                </div>

                {/* 時間與交通 */}
                <div className="space-y-6">
                    {/* 時間設定 */}
                    <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100">
                         <h3 className="font-bold text-gray-600 flex items-center gap-2">
                            <Calendar size={18} /> 時間設定
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">出發時間</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="date" 
                                        required 
                                        className="flex-1 p-2 border rounded bg-white"
                                        value={formData.dateStart}
                                        onChange={e => setFormData({...formData, dateStart: e.target.value})}
                                    />
                                    <TimeSelector value={formData.timeStart} onChange={val => setFormData({...formData, timeStart: val})} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">抵達時間 (選填)</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="date" 
                                        className="flex-1 p-2 border rounded bg-white"
                                        value={formData.dateEnd}
                                        onChange={e => setFormData({...formData, dateEnd: e.target.value})}
                                    />
                                    <TimeSelector value={formData.timeEnd} onChange={val => setFormData({...formData, timeEnd: val})} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 交通工具 */}
                    <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100">
                        <h3 className="font-bold text-gray-600 flex items-center gap-2">
                            <Plane size={18} /> 交通方式
                        </h3>
                         <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">類型</label>
                            <div className="grid grid-cols-5 gap-1">
                                {Object.entries(TRANSPORT_TYPES).map(([key, type]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setFormData({...formData, transport: key})}
                                        className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${formData.transport === key ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        {React.createElement(type.icon, { size: 20 })}
                                        <span className="text-[10px] mt-1">{type.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                             <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">班次/號碼</label>
                                <div className="flex items-center bg-white border rounded px-2">
                                    <Ticket size={14} className="text-gray-400 mr-2"/>
                                    <input 
                                        type="text" 
                                        placeholder="例如: BR87"
                                        className="w-full p-2 text-sm outline-none"
                                        value={formData.transportNumber}
                                        onChange={e => setFormData({...formData, transportNumber: e.target.value})}
                                    />
                                </div>
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">座位號碼</label>
                                <div className="flex items-center bg-white border rounded px-2">
                                    <Armchair size={14} className="text-gray-400 mr-2"/>
                                    <input 
                                        type="text" 
                                        placeholder="例如: 12A"
                                        className="w-full p-2 text-sm outline-none"
                                        value={formData.seatNumber}
                                        onChange={e => setFormData({...formData, seatNumber: e.target.value})}
                                    />
                                </div>
                             </div>
                             {/* 位置選項移入此處 */}
                             <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">位置</label>
                                <select 
                                    className="w-full p-2 border rounded bg-white text-sm h-[38px]"
                                    value={formData.seatType}
                                    onChange={e => setFormData({...formData, seatType: e.target.value})}
                                >
                                    <option value="" disabled>請選擇</option>
                                    {Object.entries(SEAT_TYPES).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                             </div>
                        </div>
                    </div>
                </div>

                {/* 費用與備註 */}
                <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100">
                    <h3 className="font-bold text-gray-600 flex items-center gap-2">
                        <DollarSign size={18} /> 其他資訊
                    </h3>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">費用</label>
                            <div className="flex">
                                <select 
                                    className="p-2 border rounded-l bg-gray-100 border-r-0 text-sm font-bold w-20"
                                    value={formData.currency}
                                    onChange={e => setFormData({...formData, currency: e.target.value})}
                                >
                                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                                </select>
                                <input 
                                    type="number" 
                                    placeholder="0" 
                                    className="w-full p-2 border rounded-r focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    value={formData.cost}
                                    onChange={e => setFormData({...formData, cost: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">備註 / 筆記</label>
                        <div className="relative">
                            <FileText className="absolute top-3 left-3 text-gray-400" size={16} />
                            <textarea 
                                className="w-full pl-10 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[80px]"
                                placeholder="寫點什麼..."
                                value={formData.notes}
                                onChange={e => setFormData({...formData, notes: e.target.value})}
                            />
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-bold hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="px-8 py-2.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-70 flex items-center gap-2"
                  >
                    {isSaving ? (
                        <>
                            <Loader className="animate-spin" size={18} /> 儲存中...
                        </>
                    ) : (
                        <>
                            <Check size={18} /> 儲存旅程
                        </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 匯出設定 Modal (預覽版) */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-[2500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col h-[90vh] animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b bg-gray-50 rounded-t-xl">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <ImageIcon size={24} className="text-blue-600"/> 匯出地圖預覽
                    </h2>
                    <button onClick={() => { setIsExportModalOpen(false); setShowExportPreview(false); }} className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 p-2 rounded-full">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 flex overflow-hidden">
                    {/* 設定欄 */}
                    <div className="w-80 border-r bg-gray-50 p-6 space-y-6 overflow-y-auto">
                        <div className="bg-blue-100 p-4 rounded-lg text-sm text-blue-800">
                            <p>💡 此為匯出圖片的預覽。請等待地圖圖資完全載入後，再點擊下載按鈕。</p>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">設定日期區間</label>
                            <div className="space-y-2">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">開始日期</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-2 border rounded"
                                        value={exportStartDate}
                                        onChange={(e) => setExportStartDate(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">結束日期</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-2 border rounded"
                                        value={exportEndDate}
                                        onChange={(e) => setExportEndDate(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        
                        {(exportStartDate || exportEndDate) && (
                            <button 
                                onClick={() => { setExportStartDate(''); setExportEndDate(''); }}
                                className="text-xs text-blue-600 hover:underline"
                            >
                                清除日期 (匯出全部)
                            </button>
                        )}
                        
                        <div className="pt-6 border-t">
                            <button 
                                onClick={downloadImage}
                                disabled={isCapturing}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait"
                            >
                                {isCapturing ? (
                                    <>
                                        <Loader className="animate-spin" size={18} />
                                        處理中...
                                    </>
                                ) : (
                                    <>
                                        <Download size={18} />
                                        下載圖片
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* 預覽區 (4:3) */}
                    <div className="flex-1 bg-slate-200 flex items-center justify-center p-8 overflow-hidden relative">
                        {/* 這個 div 是用來掛載預覽地圖的 */}
                        <div 
                            style={{ width: '480px', height: '360px', position: 'relative', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }} // 縮小的容器
                        >
                            <div ref={exportPreviewRef} className="w-full h-full bg-white relative overflow-hidden" />
                            
                            {/* Loading Overlay within preview */}
                            {isCapturing && (
                                <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center">
                                    <span className="font-bold text-blue-800">截圖中...</span>
                                </div>
                            )}
                        </div>
                        <div className="absolute bottom-4 text-xs text-gray-500">
                            預覽已縮小顯示，實際下載為 1200x900 高解析度圖片
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* ID 輸入 Modal - 分頁設計 */}
      {isIdModalOpen && (
          <div className="fixed inset-0 z-[3000] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
              
              {/* Tabs */}
              <div className="flex border-b">
                <button 
                  onClick={() => { setIdMode('enter'); setIdError(''); }}
                  className={`flex-1 py-4 font-bold text-center transition-colors ${idMode === 'enter' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <LogIn size={18} /> 進入我的地圖
                  </div>
                </button>
                <button 
                  onClick={() => { setIdMode('create'); setIdError(''); }}
                  className={`flex-1 py-4 font-bold text-center transition-colors ${idMode === 'create' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <PlusCircle size={18} /> 建立新地圖
                  </div>
                </button>
              </div>

              <div className="p-8">
                <div className="text-center mb-6">
                  <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                    <Globe size={32} />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800">
                    {idMode === 'enter' ? '歡迎回來！' : '開始新的旅程'}
                  </h2>
                  <p className="text-gray-500 mt-2 text-sm">
                    {idMode === 'enter' 
                      ? '請輸入 ID 與密碼以進入您的地圖' 
                      : '請設定專屬 ID 與密碼來建立新地圖'}
                  </p>
                </div>
                
                <form onSubmit={handleIdSubmit} className="space-y-4">
                  {/* ID Input */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">地圖 ID (英文或數字)</label>
                    <input 
                      type="text" 
                      required
                      placeholder="例如: my-trip-2025"
                      className={`w-full p-4 border-2 rounded-xl text-lg outline-none transition-colors ${idError ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                      value={tempMapIdInput}
                      onChange={(e) => {
                          setTempMapIdInput(e.target.value);
                          setIdError('');
                      }}
                    />
                  </div>

                  {/* Password Input */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">
                      {idMode === 'enter' ? '輸入密碼' : '設定密碼 (4-6位數字)'}
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required
                        placeholder="••••••"
                        maxLength={6}
                        className={`w-full pl-12 pr-12 p-4 border-2 rounded-xl text-lg outline-none transition-colors ${idError ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                        value={tempPasswordInput}
                        onChange={(e) => {
                            // Only allow numbers
                            const val = e.target.value.replace(/\D/g, '');
                            setTempPasswordInput(val);
                            setIdError('');
                        }}
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>
                  
                  {/* 記住密碼 Checkbox */}
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="rememberMe"
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <label htmlFor="rememberMe" className="text-sm text-gray-600 cursor-pointer select-none">記住 ID 與密碼 (下次自動登入)</label>
                  </div>

                  {idError && <p className="text-red-500 text-sm font-bold text-center bg-red-50 p-2 rounded">{idError}</p>}
                  
                  <button 
                    type="submit"
                    disabled={isCheckingId}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isCheckingId ? <Loader className="animate-spin" /> : (idMode === 'enter' ? '進入地圖 ➔' : '建立地圖 🚀')}
                  </button>
                </form>
                
                <div className="mt-6 text-center bg-blue-50 p-3 rounded-lg">
                  <p className="text-xs text-blue-600 font-medium">
                    💡 請牢記您的 ID 與密碼，遺失無法找回！
                  </p>
                </div>
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

      {/* ★★★ PWA 安裝提示 (iOS 教學 / Android 安裝按鈕) ★★★ */}
      {showInstallPrompt && (
        <div className="fixed bottom-4 left-4 right-4 z-[5000] bg-white rounded-xl shadow-2xl border border-gray-100 p-4 animate-in slide-in-from-bottom duration-500">
            <button 
                onClick={() => setShowInstallPrompt(false)} 
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
            >
                <X size={16} />
            </button>
            <div className="flex gap-4">
                <div className="bg-blue-100 p-3 rounded-lg flex items-center justify-center h-fit">
                   {deferredPrompt ? <Download className="text-blue-600" size={24} /> : <PlusSquare className="text-blue-600" size={24} />}
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-gray-800 text-sm mb-1">
                        {deferredPrompt ? '安裝應用程式' : '將地圖安裝到手機'}
                    </h3>
                    
                    {deferredPrompt ? (
                        <div>
                            <p className="text-xs text-gray-500 mb-2">
                                安裝後可獲得更佳的全螢幕體驗與離線存取功能。
                            </p>
                            <button 
                                onClick={handleInstallClick}
                                className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded hover:bg-blue-700 transition-colors"
                            >
                                立即安裝
                            </button>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-gray-500 mb-2 leading-relaxed">
                                在 Safari 瀏覽器下方工具列，點擊 <Share className="inline w-3 h-3 mx-1" /> 分享按鈕，然後選擇「加入主畫面」。
                            </p>
                            <div className="text-[10px] text-blue-500 bg-blue-50 px-2 py-1 rounded inline-block">
                                💡 這樣就能像 App 一樣全螢幕使用囉！
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
      )}

    </div>
  );
}
