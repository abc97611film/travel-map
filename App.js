import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, onSnapshot, query, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
// 修正：一次引入所有需要的圖示
import { Plane, Train, Bus, Ship, Car, MapPin, DollarSign, Trash2, Plus, X, Globe, ChevronLeft, ChevronRight, Check, Armchair, FileText, Ticket, RefreshCw, Coins, AlertTriangle, Menu, Download, Loader, Edit2 } from 'lucide-react';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';

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
// 1. Firebase 初始化 (使用您提供的金鑰)
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
  plane: { label: '飛機', color: '#2563eb', icon: Plane },
  train: { label: '火車', color: '#dc2626', icon: Train },
  bus:   { label: '公車/巴士', color: '#15803d', icon: Bus },
  car:   { label: '開車', color: '#84cc16', icon: Car },
  boat:  { label: '船運', color: '#000000', icon: Ship },
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

const getDisplayCityName = (name) => name; 
const getDisplayCountryName = (englishName) => COUNTRY_TRANSLATIONS[englishName] || englishName;

// 自定義 24H 時間選擇器元件
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

// -----------------------------------------------------------------------------
// 3. 主應用程式元件
// -----------------------------------------------------------------------------
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
    targetCountry: '', 
  });

  const mapContainerRef = useRef(null);
  const captureRef = useRef(null); 
  const mapInstanceRef = useRef(null);
  const geoJsonLayerRef = useRef(null);
  const pickingLocationMode = useRef(null); 
  const layersRef = useRef([]); 
  const pickerMarkerRef = useRef(null);
  
  const latestDataRef = useRef({ trips: [], allCountries: [] });

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
        // Fallback for index error
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
    if (mapInstanceRef.current || !mapContainerRef.current) return;
    
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
                    targetCountry: countryName 
                  });
                  setEditingId(null);
                  
                  if (initOriginCountry) fetchCitiesForCountry(initOriginCountry, 'origin');
                  setDestCities([]); // 目的地清空
                  
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
        
        const dateDisplay = trip.dateStart ? `${trip.dateStart} ${trip.timeStart || ''}` : '';
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
          targetCountry: countryName 
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
    try {
      if (editingId) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'travel_trips', editingId), {
            ...formData,
            updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'travel_trips'), {
            ...formData,
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

  // ★★★ 將 renderCityInput 移入 App 組件內 ★★★
  const renderCityInput = (type) => {
    const isOrigin = type === 'origin';
    const cities = isOrigin ? originCities : destCities;
    const isLoading = isOrigin ? isLoadingOriginCities : isLoadingDestCities;
    
    // 這裡我們不再用 isManual 狀態，而是直接讓 select 裡面包含所有選項，或者如果要做 Manual 輸入模式，需在此處實作切換邏輯。
    // 在這個修復版中，為了簡化並確保功能正常，我們維持「下拉選單」模式，並保留「其他 (自行輸入)」的接口（如果有的話）。
    // 若要支援自行輸入，可以在 select 的 onChange 裡判斷 value === 'OTHER' 然後切換 UI。
    // 目前先維持下拉選單功能。
    
    const fieldCountry = isOrigin ? 'originCountry' : 'destCountry';
    const fieldCity = isOrigin ? 'originCity' : 'destCity';
    const fieldLat = isOrigin ? 'originLat' : 'destLat';
    const fieldLng = isOrigin ? 'originLng' : 'destLng';
    
    const label = isOrigin ? '出發城市/地點' : '抵達城市/地點';
    const placeholder = isOrigin ? '例如: 台北' : '例如: 東京';
    
    // 這裡使用一個簡單的 local state 來控制 manual 模式 (如果需要)
    // 但為了避免過度複雜，我們直接渲染。
    
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
          {/* 匯出按鈕：開啟選項視窗 */}
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
            {trips.length === 0 ? (
              <div className="text-center text-gray-400 mt-10">
                <p>還沒有旅程紀錄</p>
                <p className="text-sm mt-2">點擊地圖上的國家開始記錄！</p>
              </div>
            ) : (
              trips.map(trip => (
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
                      {trip.dateStart} 
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

                  {(trip.transportNumber || trip.seatNumber || trip.notes || trip.cost) && (
                    <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded space-y-1">
                      {trip.cost && (
                        <div className="flex items-center gap-1 font-semibold text-gray-600">
                          <Coins size={10} /> 
                          <span>
                            費用: {(trip.currency && !isNaN(parseFloat(trip.cost))) ? `${trip.currency} ${trip.cost}` : trip.cost}
                          </span>
                        </div>
                      )}
                      {trip.transportNumber && (
                        <div className="flex items-center gap-1">
                          <Ticket size={10} /> <span>班次: {trip.transportNumber}</span>
                        </div>
                      )}
                      {(trip.seatNumber || (trip.seatType && trip.seatType !== 'none')) && (
                         <div className="flex items-center gap-1">
                          <Armchair size={10} /> 
                          <span>
                            座位: {trip.seatNumber || '--'} 
                            {trip.seatType && trip.seatType !== 'none' && ` (${SEAT_TYPES[trip.seatType]})`}
                          </span>
                        </div>
                      )}
                      {trip.notes && (
                        <div className="flex items-start gap-1">
                          <FileText size={10} className="mt-0.5" /> <span className="line-clamp-2">{trip.notes}</span>
                        </div>
                      )}
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
            )}
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
