import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, onSnapshot, query, deleteDoc, doc, serverTimestamp, orderBy, getDoc, setDoc, limit, getDocs } from 'firebase/firestore';
import { Plane, Train, Bus, Ship, Car, MapPin, DollarSign, Trash2, Plus, X, Globe, ChevronLeft, ChevronRight, Check, Armchair, FileText, Ticket, RefreshCw, Coins, AlertTriangle, Menu, Loader, Edit2, Share2, LogOut, Lock, LogIn, PlusCircle, Eye, EyeOff, Map, Calendar, Download, Image as ImageIcon } from 'lucide-react';

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
  "Sydney": "雪梨", "Melbourne": "墨爾本", "Bangkok": "曼谷", "Singapore": "新加坡"
};

const PREDEFINED_CITIES = {
  "North Macedonia": ["Skopje", "Ohrid", "Bitola", "Kumanovo", "Prilep", "Tetovo", "Veles", "Stip", "Gostivar", "Strumica"],
  "Kosovo": ["Pristina", "Prizren", "Peja", "Gjakova", "Mitrovica"],
  "Montenegro": ["Podgorica", "Kotor", "Budva", "Bar", "Herceg Novi", "Tivat"],
  "Taiwan": ["Taipei", "Kaohsiung", "Taichung", "Tainan", "Taoyuan", "Hsinchu", "Keelung", "Chiayi", "Hualien", "Taitung"],
  "Bosnia and Herzegovina": ["Sarajevo", "Mostar", "Banja Luka", "Tuzla", "Zenica"],
  "Albania": ["Tirana", "Durres", "Vlore", "Shkoder", "Sarande"],
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

// OSRM 路徑抓取 - 獨立函式，增強錯誤處理
const fetchRoutePath = async (lat1, lng1, lat2, lng2) => {
    try {
        // 使用 HTTPS 避免 Mixed Content
        const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [allCountries, setAllCountries] = useState([]);
  const [originCities, setOriginCities] = useState([]);
  const [destCities, setDestCities] = useState([]);
  const [isLoadingOriginCities, setIsLoadingOriginCities] = useState(false);
  const [isLoadingDestCities, setIsLoadingDestCities] = useState(false);
  
  // 手動輸入模式
  const [isOriginManual, setIsOriginManual] = useState(false);
  const [isDestManual, setIsDestManual] = useState(false);
  
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
  const [rememberMe, setRememberMe] = useState(false); // 新增：記住密碼狀態
  
  // ★★★ 匯出相關狀態 ★★★
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

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
  const worldGeoJsonRef = useRef(null); // 儲存原始 GeoJSON 資料供匯出使用
  const layersRef = useRef([]); 
  const pickerMarkerRef = useRef(null);
  const pickingLocationMode = useRef(null);
  const latestDataRef = useRef({ trips: [], allCountries: [] });
  const visitedCountriesRef = useRef(new Set()); // 用於高亮邏輯

  const safeDateDisplay = (date) => {
    if (!date) return '';
    if (typeof date === 'string') return date;
    if (date?.toDate) return date.toDate().toLocaleDateString();
    return String(date);
  };

  useEffect(() => {
    latestDataRef.current = { trips, allCountries };
    // 更新去過的國家 Set
    const today = new Date().toISOString().split('T')[0];
    const activeTrips = trips.filter(t => t.dateStart && t.dateStart <= today);
    visitedCountriesRef.current = new Set(activeTrips.flatMap(t => [t.targetCountry, t.destCountry, t.originCountry]).filter(Boolean));
  }, [trips, allCountries]);

  // ★★★ 初始化：檢查網址與 LocalStorage ★★★
  useEffect(() => {
      // 1. 檢查網址
      const params = new URLSearchParams(window.location.search);
      const mapIdFromUrl = params.get('map');
      
      // 2. 檢查 LocalStorage (記住密碼)
      const storedAuth = localStorage.getItem('travel_map_auth');
      
      if (mapIdFromUrl) {
          setTempMapIdInput(mapIdFromUrl);
          setIdMode('enter');
          setIsIdModalOpen(true);
      } else if (storedAuth) {
          try {
              const { id, password } = JSON.parse(storedAuth);
              setTempMapIdInput(id);
              setTempPasswordInput(password);
              setRememberMe(true);
              setIdMode('enter');
              setIsIdModalOpen(true);
          } catch(e) {
              console.error("Local storage parse error", e);
          }
      } else {
          setIsIdModalOpen(true);
      }
  }, []);

  // ★★★ 處理 ID 與密碼提交 ★★★
  const handleIdSubmit = async (e) => {
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

          // 登入成功，處理「記住密碼」
          if (rememberMe) {
              localStorage.setItem('travel_map_auth', JSON.stringify({ id: cleanId, password }));
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
  };

  // Helper function to handle sharing
  const handleShare = () => {
      const url = window.location.href;
      navigator.clipboard.writeText(url).then(() => {
          alert(`網址已複製！\n請記得將您的「地圖 ID」和「密碼」告訴朋友，他們才能編輯喔！\n\n網址：${url}`);
      });
  };

  // Helper function to switch map
  const handleSwitchMap = () => {
      const confirmSwitch = window.confirm("確定要登出並切換地圖嗎？");
      if (confirmSwitch) {
          localStorage.removeItem('travel_map_auth'); // 登出時清除
          window.location.reload(); 
      }
  };

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
  }, [user, currentMapId]); // 當 Map ID 改變時重新監聽

  useEffect(() => {
    const countries = Object.entries(COUNTRY_TRANSLATIONS).map(([key, value]) => ({
        name: key,
        label: `${value} (${key})`
    }));
    countries.sort((a, b) => {
        // 修正排序：台灣 -> 匈牙利 -> 其他
        if (a.name === "Taiwan") return -1;
        if (b.name === "Taiwan") return 1;
        if (a.name === "Hungary") return -1;
        if (b.name === "Hungary") return 1;
        return a.name.localeCompare(b.name);
    });
    setAllCountries(countries);
  }, []);

  // ★★★ 核心匯出功能 ★★★
  const handleExportMap = async () => {
    if (!window.L || !window.html2canvas) {
        alert("匯出元件尚未載入完成，請稍後再試");
        return;
    }
    setIsExporting(true);

    // 1. 篩選資料
    let filteredTrips = trips;
    if (exportStartDate && exportEndDate) {
        filteredTrips = trips.filter(t => {
            if (!t.dateStart) return false;
            return t.dateStart >= exportStartDate && t.dateStart <= exportEndDate;
        });
    }

    // 2. 建立隱藏的 DOM 容器 (4:3 比例, 1200x900)
    // 修正：使用 left:0, top:0, z-index:-9999 避免 html2canvas 因為元素在 viewport 外而不渲染
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = '1200px';
    container.style.height = '900px';
    container.style.backgroundColor = '#f1f5f9'; // bg-slate-100
    container.style.zIndex = '-9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.fontFamily = 'sans-serif';
    document.body.appendChild(container);

    // 3. 建立標頭
    const header = document.createElement('div');
    header.style.padding = '20px';
    header.style.backgroundColor = '#1e3a8a'; // bg-blue-900
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

    // 4. 建立地圖區域
    const mapWrapper = document.createElement('div');
    mapWrapper.style.flex = '1';
    mapWrapper.style.position = 'relative';
    container.appendChild(mapWrapper);

    const mapDiv = document.createElement('div');
    mapDiv.style.width = '100%';
    mapDiv.style.height = '100%';
    mapWrapper.appendChild(mapDiv);

    // 5. 初始化 Leaflet (無控制項)
    const L = window.L;
    const exportMap = L.map(mapDiv, {
        zoomControl: false,       // 移除縮放按鈕
        attributionControl: false, // 移除右下角版權文字
        preferCanvas: true,
        fadeAnimation: false,
        zoomAnimation: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        crossOrigin: true 
    }).addTo(exportMap);

    // ★★★ 6. 加入國家圖層並高亮顯示 ★★★
    if (worldGeoJsonRef.current) {
        // 計算去過的國家 (只針對 filteredTrips)
        const visitedCountries = new Set(filteredTrips.flatMap(t => [t.targetCountry, t.destCountry, t.originCountry]).filter(Boolean));
        
        L.geoJSON(worldGeoJsonRef.current, {
            style: { fillColor: '#cbd5e1', weight: 1, opacity: 1, color: 'white', fillOpacity: 0.5 },
            onEachFeature: (feature, layer) => {
                const countryName = feature.properties.name;
                if (visitedCountries.has(countryName)) {
                    // 高亮顏色
                    layer.setStyle({ fillColor: '#fcd34d', fillOpacity: 0.8, weight: 1 });
                }
            }
        }).addTo(exportMap);
    }

    // 7. 加入路徑圖層 (只加入 filteredTrips)
    const bounds = L.latLngBounds();
    let hasData = false;

    filteredTrips.forEach(trip => {
      if (trip.originLat && trip.originLng && trip.destLat && trip.destLng) {
        hasData = true;
        const typeConfig = TRANSPORT_TYPES[trip.transport] || TRANSPORT_TYPES.plane;
        
        let polyline;
        // ★★★ 飛機使用大圓航線，其他使用路徑或直線 ★★★
        if (trip.transport === 'plane') {
             const curvedPoints = getGreatCirclePoints(trip.originLat, trip.originLng, trip.destLat, trip.destLng);
             polyline = L.polyline(curvedPoints, { color: typeConfig.color, weight: 4, opacity: 0.8 }).addTo(exportMap);
        } else if (typeConfig.useRoute && trip.routePath && trip.routePath.length > 0) {
            polyline = L.polyline(trip.routePath, { color: typeConfig.color, weight: 4, opacity: 0.8 }).addTo(exportMap);
        } else {
            polyline = L.polyline([[trip.originLat, trip.originLng], [trip.destLat, trip.destLng]], { color: typeConfig.color, weight: 4, opacity: 0.8 }).addTo(exportMap);
        }
        
        // 為了讓 bounds 包含路徑，我們簡單把起終點加入
        bounds.extend([trip.originLat, trip.originLng]);
        bounds.extend([trip.destLat, trip.destLng]);

        L.circleMarker([trip.originLat, trip.originLng], { radius: 5, color: typeConfig.color, fillOpacity: 1 }).addTo(exportMap);
        L.circleMarker([trip.destLat, trip.destLng], { radius: 5, color: typeConfig.color, fillOpacity: 1 }).addTo(exportMap);
      }
    });

    // 8. 設定視野
    if (hasData && bounds.isValid()) {
        exportMap.fitBounds(bounds, { padding: [50, 50] });
    } else {
        exportMap.setView([48, 15], 4); // 預設歐洲/世界
    }

    // 9. 建立圖例 (Legend) - 放在容器底部
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

    // 10. 等待 Render 並截圖
    try {
        // 增加等待時間到 3秒，並使用 Promise 封裝
        await new Promise(r => setTimeout(r, 3000));

        const canvas = await window.html2canvas(container, {
            useCORS: true, // 允許跨域圖片 (地圖瓦片)
            scale: 2,      // 提高解析度
            logging: false,
            allowTaint: true,
            backgroundColor: '#f1f5f9'
        });
        
        // 11. 下載
        const link = document.createElement('a');
        link.download = `travel-map-export-${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

    } catch (err) {
        console.error("Export failed:", err);
        alert("匯出失敗，請檢查網路連線或稍後再試。");
    } finally {
        // 12. 清理
        exportMap.remove();
        if (document.body.contains(container)) {
            document.body.removeChild(container);
        }
        setIsExporting(false);
        setIsExportModalOpen(false);
    }
  };

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
    const setCities = type === 'origin' ? setOriginCities : setDestCities;
    const setLoading = type === 'origin' ? setIsLoadingOriginCities : setIsLoadingDestCities;
    const setManual = type === 'origin' ? setIsOriginManual : setIsDestManual;

    setLoading(true);
    setManual(false); 

    // 1. 先檢查是否有預定義的城市清單 (包含北馬其頓)
    if (PREDEFINED_CITIES[country]) {
        const processedCities = PREDEFINED_CITIES[country].map(city => ({
            value: getDisplayCityName(city),
            label: getDisplayCityName(city),
            original: city
        }));
        processedCities.sort((a, b) => a.label.localeCompare(b.label));
        setCities(processedCities);
        setLoading(false);
        return; // 直接返回，不用去 Call API
    }

    // 2. 如果沒有預定義，才嘗試 API
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
        let initDestCountry = '';

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
          destCountry: initDestCountry, 
          destCity: '', destLat: null, destLng: null,
          dateStart: '', timeStart: '', dateEnd: '', timeEnd: '',
          transport: 'plane', cost: '', currency: 'EUR',
          transportNumber: '', seatNumber: '', seatType: 'window', notes: '',
          targetCountry: countryName, routePath: null
        });
        
        if (initOriginCountry) fetchCitiesForCountry(initOriginCountry, 'origin');
        else setOriginCities([]);
        
        if (initDestCountry) fetchCitiesForCountry(initDestCountry, 'dest');
        else setDestCities([]);
    }
    setIsModalOpen(true);
  };

  const renderMapLayers = (tripsToRender) => {
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
        const today = new Date().toISOString().split('T')[0];
        // 只要行程是過去或進行中，相關國家都亮起
        const activeTrips = tripsToRender.filter(t => t.dateStart && t.dateStart <= today);
        const visitedCountries = new Set(activeTrips.flatMap(t => [t.targetCountry, t.destCountry, t.originCountry]).filter(Boolean));
        
        // 更新高亮邏輯：每次 render 都重新檢查顏色
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
        let polyline;
        
        // ★★★ 飛機顯示大圓航線 ★★★
        if (trip.transport === 'plane') {
             const curvedPoints = getGreatCirclePoints(trip.originLat, trip.originLng, trip.destLat, trip.destLng);
             polyline = L.polyline(curvedPoints, { color: typeConfig.color, weight: 3, opacity: 0.8, dashArray: isFutureOrNoDate ? '10, 10' : null }).addTo(map);
        }
        // ★★★ 地面交通優先使用實際路徑 ★★★
        else if (typeConfig.useRoute && trip.routePath && trip.routePath.length > 0) {
            polyline = L.polyline(trip.routePath, { color: typeConfig.color, weight: 3, opacity: 0.8, dashArray: isFutureOrNoDate ? '10, 10' : null }).addTo(map);
        } else {
            const straightLatLngs = [[trip.originLat, trip.originLng], [trip.destLat, trip.destLng]];
            polyline = L.polyline(straightLatLngs, { color: typeConfig.color, weight: 3, opacity: 0.8, dashArray: isFutureOrNoDate ? '10, 10' : null }).addTo(map);
        }

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
    if (!loading && mapLoaded) { 
        renderMapLayers(trips);
    }
  }, [trips, loading, mapLoaded]);

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
        setFormData(prev => ({ ...prev, [pickingLocationMode.current === 'origin' ? 'originLat' : 'destLat']: lat, [pickingLocationMode.current === 'origin' ? 'originLng' : 'destLng']: lng }));
        if (pickerMarkerRef.current) map.removeLayer(pickerMarkerRef.current);
        pickerMarkerRef.current = L.circleMarker([lat, lng], { radius: 8, color: '#f97316', fillColor: '#f97316', fillOpacity: 0.8, weight: 2 }).addTo(map).bindPopup(pickingLocationMode.current === 'origin' ? "出發地" : "目的地").openPopup();
      }
    });

    // ★★★ 修正國界粗糙問題：改用高解析度的 GeoJSON Source (holtzy/D3-graph-gallery) ★★★
    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
      .then(res => res.json())
      .then(data => {
        // ★★★ 儲存原始資料供匯出使用 ★★★
        worldGeoJsonRef.current = data;
        
        geoJsonLayerRef.current = L.geoJSON(data, {
          style: { fillColor: '#cbd5e1', weight: 1, opacity: 1, color: 'white', fillOpacity: 0.5 },
          onEachFeature: (feature, layer) => {
            const countryName = feature.properties.name;
            const displayName = getDisplayCountryName(countryName);
            layer.bindTooltip(displayName, { sticky: true, direction: 'top' });
            layer.on({
              mouseover: (e) => { e.target.setStyle({ weight: 2, color: '#666', fillOpacity: 0.7 }); },
              // ★★★ 修正高亮消失問題：移出時檢查是否為去過的國家，手動設定顏色，不使用 resetStyle ★★★
              mouseout: (e) => { 
                const isVisited = visitedCountriesRef.current.has(countryName);
                if (isVisited) {
                    e.target.setStyle({ fillColor: '#fcd34d', fillOpacity: 0.8, weight: 1, color: 'white' });
                } else {
                    e.target.setStyle({ fillColor: '#cbd5e1', fillOpacity: 0.5, weight: 1, color: 'white' });
                }
              },
              click: (e) => {
                if (pickingLocationMode.current) {
                  fetchCitiesForCountry(countryName, pickingLocationMode.current);
                  setFormData(prev => ({ ...prev, [pickingLocationMode.current === 'origin' ? 'originCountry' : 'destCountry']: countryName, [pickingLocationMode.current === 'origin' ? 'originCity' : 'destCity']: '' }));
                } else {
                  openModal(countryName);
                }
              }
            });
          }
        }).addTo(map);
      });
  }, [libLoaded]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);
    
    let finalRoutePath = null;
    const transportType = TRANSPORT_TYPES[formData.transport];
    
    // ★★★ 修正手機版路徑抓取邏輯：使用共用的 fetchRoutePath 函式 ★★★
    if (transportType && transportType.useRoute && formData.originLat && formData.originLng && formData.destLat && formData.destLng) {
        // 嘗試抓取路徑，如果失敗會回傳 null，之後就會自動變成直線
        finalRoutePath = await fetchRoutePath(formData.originLat, formData.originLng, formData.destLat, formData.destLng);
    }
    
    // 將座標陣列轉為 JSON 字串存入 Firestore
    const finalData = { ...formData, routePath: finalRoutePath ? JSON.stringify(finalRoutePath) : null };

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
    } catch (err) { console.error("Error saving trip:", err); } 
    finally { setIsSaving(false); }
  };

  const requestDelete = (e, id) => { e.stopPropagation(); setDeleteConfirmId(id); };
  const confirmDelete = async () => {
    if (!user || !deleteConfirmId) return;
    try { await deleteDoc(doc(db, 'artifacts', appId, 'users', currentMapId, 'travel_trips', deleteConfirmId)); setDeleteConfirmId(null); } 
    catch (err) { console.error("Error deleting trip:", err); }
  };

  const renderCityInput = (type) => {
    const isOrigin = type === 'origin';
    const cities = isOrigin ? originCities : destCities;
    const isLoading = isOrigin ? isLoadingOriginCities : isLoadingDestCities;
    const isManual = isOrigin ? isOriginManual : isDestManual;
    const setManual = isOrigin ? setIsOriginManual : setIsDestManual;
    
    const fieldCountry = isOrigin ? 'originCountry' : 'destCountry';
    const fieldCity = isOrigin ? 'originCity' : 'destCity';
    const fieldLat = isOrigin ? 'originLat' : 'destLat';
    const fieldLng = isOrigin ? 'originLng' : 'destLng';
    
    const label = isOrigin ? '出發城市/地點' : '抵達城市/地點';
    const placeholder = isOrigin ? '例如: 台北' : '例如: 東京';
    
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
            {!isManual ? (
                <select
                className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                value={cities.some(c => c.value === formData[fieldCity]) ? formData[fieldCity] : ""}
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

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 font-sans text-gray-800">
      
      <header className="bg-blue-900 text-white p-4 shadow-md flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <Map className="w-6 h-6" />
          <div>
              <h1 className="text-xl font-bold tracking-wide">🗺️歐洲交換趴趴走</h1>
              {currentMapId && (
                  <div className="text-xs opacity-70 flex items-center gap-1">
                      ID: <span className="font-mono bg-blue-800 px-1 rounded">{currentMapId}</span>
                      <button onClick={handleShare} className="hover:text-yellow-300 ml-1" title="複製連結"><Share2 size={12}/></button>
                  </div>
              )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs opacity-70 hidden sm:block">
            {loading ? '載入中...' : `已記錄 ${trips.length} 趟旅程`}
          </div>

          <button
            onClick={() => setIsExportModalOpen(true)}
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
      
      {/* 匯出設定 Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-[2500] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <ImageIcon size={24} className="text-blue-600"/> 匯出地圖圖片
                    </h2>
                    <button onClick={() => setIsExportModalOpen(false)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-4 mb-6">
                    <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800">
                        <p>💡 將根據選擇的日期範圍，產生一張 4:3 比例的精美地圖圖片。圖片會自動縮放以包含所有行程。</p>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">設定日期區間 (留空則匯出全部)</label>
                        <div className="flex gap-2 items-center">
                            <div className="flex-1">
                                <label className="text-xs text-gray-500 block mb-1">開始日期</label>
                                <input 
                                    type="date" 
                                    className="w-full p-2 border rounded"
                                    value={exportStartDate}
                                    onChange={(e) => setExportStartDate(e.target.value)}
                                />
                            </div>
                            <span className="pt-5 text-gray-400">➜</span>
                            <div className="flex-1">
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
                            清除日期 (匯出全部時間)
                        </button>
                    )}
                </div>

                <div className="flex gap-3 justify-end">
                    <button 
                        onClick={() => setIsExportModalOpen(false)}
                        className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        取消
                    </button>
                    <button 
                        onClick={handleExportMap}
                        disabled={isExporting}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-wait"
                    >
                        {isExporting ? (
                            <>
                                <Loader className="animate-spin" size={18} />
                                產生中...
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
                  disabled={isSaving} // 防止重複提交
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 text-base flex items-center gap-2"
                >
                  {isSaving ? <Loader className="animate-spin" size={20}/> : (editingId ? '更新旅程' : '儲存旅程')}
                </button>
              </div>

            </form>
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
