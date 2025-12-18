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
              setRememberMe(true); // ★★★ 確保這裡設為 true
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

          // ★★★ 登入成功，處理「記住密碼」邏輯修正 ★★★
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
    // ★★★ 修正匯出卡住問題：使用 wrapper 隱藏，而不是 z-index 負值或 position hidden ★★★
    // 我們建立一個 invisible wrapper
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.width = '0';
    wrapper.style.height = '0';
    wrapper.style.overflow = 'hidden';
    wrapper.style.zIndex = '9999'; // 確保在最上層，但因為 wh=0 所以看不到
    document.body.appendChild(wrapper);

    const container = document.createElement('div');
    container.style.width = '1200px';
    container.style.height = '900px';
    container.style.backgroundColor = '#f1f5f9';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.fontFamily = 'sans-serif';
    // 這裡不需要 position fixed，因為它在 wrapper 裡面
    wrapper.appendChild(container);

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
        if (document.body.contains(wrapper)) {
            document.body.removeChild(wrapper);
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

    // ★★★ 修正國界粗糙問題：改用 datasets/geo-countries 的 GeoJSON Source，這版本解析度較高 ★★★
    fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
      .then(res => res.json())
      .then(data => {
        // ★★★ 儲存原始資料供匯出使用 ★★★
        worldGeoJsonRef.current = data;
        
        geoJsonLayerRef.current = L.geoJSON(data, {
          style: { fillColor: '#cbd5e1', weight: 1, opacity: 1, color: 'white', fillOpacity: 0.5 },
          onEachFeature: (feature, layer) => {
            // 注意：不同 GeoJSON 的屬性名稱可能不同，這裡是 ADMIN
            const countryName = feature.properties.ADMIN || feature.properties.name; 
            // 存回去確保相容性
            feature.properties.name = countryName; 
            
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
