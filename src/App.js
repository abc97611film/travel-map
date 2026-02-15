import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, onSnapshot, query, deleteDoc, doc, serverTimestamp, orderBy, getDoc, setDoc, limit, getDocs } from 'firebase/firestore';
import { Plane, Train, Bus, Ship, Car, MapPin, DollarSign, Trash2, Plus, X, Globe, ChevronLeft, ChevronRight, Check, Armchair, FileText, Ticket, RefreshCw, AlertTriangle, Menu, Loader, Edit2, Share2, LogOut, Lock, LogIn, PlusCircle, Eye, EyeOff, Map, Calendar, Download, ArrowRight, Trophy, List, ChevronUp, ChevronDown } from 'lucide-react';

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
       return { lat: 31.080056, lng: -4.011861 };
    }
    
    // 特別處理 Fes (費茲) 的座標
    if (city.includes("Fes") || city.includes("費茲")) {
          return { lat: 34.033333, lng: -5.000000 };
    }

    // 特別處理 馬爾他騎士團 (Sovereign Military Order of Malta) 的座標
    if (city.includes("Magistral Palace") || city.includes("馬爾他宮")) {
        return { lat: 41.905278, lng: 12.480556 };
    }
    if (city.includes("Magistral Villa") || city.includes("馬爾他部")) {
        return { lat: 41.882944, lng: 12.478194 };
    }

    // 特別處理 蒙地卡羅 (Monte Carlo) 的座標
    if (city.includes("Monte Carlo") || city.includes("蒙地卡羅")) {
        return { lat: 43.737611, lng: 7.420361 };
    }

    try {
      // 移除括號內的中文，只用英文名搜尋，提高準確度
      const cleanCity = city.split(' (')[0];
      const query = `${cleanCity}, ${country}`;
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
// 2. 翻譯資料庫 (全球擴充版)
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

  // === 歐洲 (Europe) ===
  "Albania": "阿爾巴尼亞", "Andorra": "安道爾", "Armenia": "亞美尼亞", "Austria": "奧地利", 
  "Azerbaijan": "亞塞拜然", "Belarus": "白俄羅斯", "Belgium": "比利時", 
  "Bosnia and Herzegovina": "波士尼亞與赫塞哥維納", "Bulgaria": "保加利亞", 
  "Croatia": "克羅埃西亞", "Cyprus": "賽普勒斯", "Czech Republic": "捷克", 
  "Denmark": "丹麥", "Estonia": "愛沙尼亞", "Finland": "芬蘭", 
  "France": "法國", "Georgia": "喬治亞", "Germany": "德國", "Greece": "希臘", 
  "Hungary": "匈牙利", "Iceland": "冰島", "Ireland": "愛爾蘭", "Italy": "義大利", 
  "Kosovo": "科索沃", "Latvia": "拉脫維亞", "Liechtenstein": "列支敦斯登", 
  "Lithuania": "立陶宛", "Luxembourg": "盧森堡", "Malta": "馬爾他", 
  "Moldova": "摩爾多瓦", "Monaco": "摩納哥", "Montenegro": "蒙特內哥羅", 
  "Netherlands": "荷蘭", "North Macedonia": "北馬其頓", "Norway": "挪威", 
  "Poland": "波蘭", "Portugal": "葡萄牙", "Romania": "羅馬尼亞", "Russia": "俄羅斯", 
  "San Marino": "聖馬利諾", "Serbia": "塞爾維亞", "Slovakia": "斯洛伐克", 
  "Slovenia": "斯洛維尼亞", "Spain": "西班牙", "Sweden": "瑞典", "Switzerland": "瑞士", 
  "Turkey": "土耳其", "Ukraine": "烏克蘭", "United Kingdom": "英國", 
  "Vatican City": "梵蒂岡", "Sovereign Military Order of Malta": "馬爾他騎士團",
  
  // === 歐洲 - 特殊/有限承認/屬地 ===
  "Faroe Islands": "法羅群島", "Gibraltar": "直布羅陀", "Guernsey": "根西島", 
  "Isle of Man": "曼島", "Jersey": "澤西島", "Åland Islands": "奧蘭群島",
  "Svalbard and Jan Mayen": "司瓦爾巴群島", "Transnistria": "外涅斯特里亞",
  "Northern Cyprus": "北賽普勒斯", "Abkhazia": "阿布哈茲", "South Ossetia": "南奧塞提亞",

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
  "Nicaragua": "尼加拉瓜", "USA": "美國", "Barbados": "巴貝多", "Saint Lucia": "聖露西亞",
  "Trinidad and Tobago": "千里達及托巴哥", "Aruba": "阿魯巴", "Curacao": "庫拉索",

  // === 大洋洲 (Oceania) ===
  "Australia": "澳洲", "New Zealand": "紐西蘭", "Fiji": "斐濟", "Palau": "帛琉", "Guam": "關島",
  "Papua New Guinea": "巴布亞紐幾內亞", "Solomon Islands": "索羅門群島", "Vanuatu": "萬那杜",
  "Samoa": "薩摩亞", "Tonga": "東加", "Cook Islands": "庫克群島", "French Polynesia": "法屬玻里尼西亞",
  "New Caledonia": "新喀里多尼亞",

  // === 非洲 (Sub-Saharan Africa) ===
  "South Africa": "南非", "Kenya": "肯亞", "Tanzania": "坦尚尼亞", "Ethiopia": "衣索比亞", 
  "Nigeria": "奈及利亞", "Ghana": "迦納", "Madagascar": "馬達加斯加", "Sudan": "蘇丹",
  "Namibia": "納米比亞", "Botswana": "波札那", "Zimbabwe": "辛巴威", "Zambia": "尚比亞",
  "Uganda": "烏干達", "Rwanda": "盧安達", "Senegal": "塞內加爾", "Ivory Coast": "象牙海岸",
  "Mauritius": "模里西斯", "Seychelles": "塞席爾"
};

const CITY_TRANSLATIONS = {
  // 亞洲
  "Taipei": "台北", "Kaohsiung": "高雄", "Taichung": "台中", "Tainan": "台南", "Taoyuan": "桃園", "Hsinchu": "新竹",
  "Tokyo": "東京", "Osaka": "大阪", "Kyoto": "京都", "Seoul": "首爾", "Busan": "釜山", "Bangkok": "曼谷", "Chiang Mai": "清邁",
  "Hanoi": "河內", "Ho Chi Minh City": "胡志明市", "Singapore": "新加坡", "Kuala Lumpur": "吉隆坡", "Jakarta": "雅加達", "Bali": "峇里島",
  "Manila": "馬尼拉", "Cebu": "宿霧", "New Delhi": "新德里", "Mumbai": "孟買", "Kathmandu": "加德滿都", "Male": "馬利",
  
  // 歐洲 (含冷門/小鎮)
  "London": "倫敦", "Edinburgh": "愛丁堡", "Manchester": "曼徹斯特", "Liverpool": "利物浦", "Oxford": "牛津", "Cambridge": "劍橋", "Bath": "巴斯", "York": "約克", "Cotswolds": "科茲窩",
  "Paris": "巴黎", "Lyon": "里昂", "Nice": "尼斯", "Marseille": "馬賽", "Bordeaux": "波爾多", "Strasbourg": "史特拉斯堡", "Colmar": "科爾馬", "Annecy": "安錫", "Avignon": "亞維儂", "Chamonix": "夏慕尼", "Mont Saint-Michel": "聖米歇爾山",
  "Berlin": "柏林", "Munich": "慕尼黑", "Frankfurt": "法蘭克福", "Hamburg": "漢堡", "Cologne": "科隆", "Heidelberg": "海德堡", "Rothenburg ob der Tauber": "羅騰堡", "Fussen": "福森", "Dresden": "德勒斯登",
  "Amsterdam": "阿姆斯特丹", "Rotterdam": "鹿特丹", "The Hague": "海牙", "Utrecht": "烏特勒支", "Giethoorn": "羊角村", "Delft": "台夫特",
  "Brussels": "布魯塞爾", "Bruges": "布魯日", "Ghent": "根特", "Antwerp": "安特衛普", "Dinant": "迪南",
  "Vienna": "維也納", "Salzburg": "薩爾斯堡", "Hallstatt": "哈爾施塔特", "Innsbruck": "因斯布魯克", "Graz": "格拉茲",
  "Zurich": "蘇黎世", "Geneva": "日內瓦", "Bern": "伯恩", "Lucerne": "琉森", "Zermatt": "策馬特", "Interlaken": "因特拉肯", "Grindelwald": "格林德瓦", "Lauterbrunnen": "勞特布龍嫩",
  "Rome": "羅馬", "Milan": "米蘭", "Venice": "威尼斯", "Florence": "佛羅倫斯", "Naples": "拿坡里", "Pisa": "比薩", "Cinque Terre": "五漁村", "Positano": "波西塔諾", "Amalfi": "阿瑪菲", "Sorrento": "蘇連多", "Alberobello": "阿爾貝羅貝洛", "Matera": "馬泰拉", "Como": "科莫",
  "Madrid": "馬德里", "Barcelona": "巴塞隆納", "Seville": "塞維亞", "Granada": "格拉納達", "Valencia": "瓦倫西亞", "Toledo": "托雷多", "Segovia": "塞哥維亞", "Ronda": "隆達", "Cordoba": "哥多華",
  "Lisbon": "里斯本", "Porto": "波多", "Sintra": "辛特拉", "Cascais": "卡斯凱什", "Obidos": "奧比杜什", "Lagos": "拉哥斯",
  "Copenhagen": "哥本哈根", "Odense": "奧登斯", "Aarhus": "奧胡斯",
  "Stockholm": "斯德哥爾摩", "Gothenburg": "哥特堡", "Malmo": "馬爾默", "Kiruna": "基律納", "Abisko": "阿比斯庫",
  "Oslo": "奧斯陸", "Bergen": "卑爾根", "Tromso": "特罗姆瑟", "Stavanger": "斯塔萬格", "Lofoten": "羅弗敦群島",
  "Helsinki": "赫爾辛基", "Rovaniemi": "羅瓦涅米", "Turku": "圖爾庫",
  "Reykjavik": "雷克雅維克", "Vik": "維克", "Akureyri": "阿克雷里",
  "Prague": "布拉格", "Cesky Krumlov": "庫倫洛夫", "Brno": "布爾諾", "Karlovy Vary": "卡羅維瓦利",
  "Budapest": "布達佩斯", "Debrecen": "德布勒森", "Eger": "埃格爾",
  "Warsaw": "華沙", "Krakow": "克拉科夫", "Gdansk": "格但斯克", "Wroclaw": "弗羅茨瓦夫", "Zakopane": "扎科帕內",
  "Tallinn": "塔林", "Riga": "里加", "Vilnius": "維爾紐斯", "Trakai": "特拉凱",
  "Dubrovnik": "杜布羅夫尼克", "Split": "斯普利特", "Zagreb": "札格瑞布", "Zadar": "札達爾", "Plitvice Lakes": "十六湖", "Hvar": "赫瓦爾", "Rovinj": "羅維尼",
  "Ljubljana": "盧布爾雅那", "Bled": "布萊德", "Piran": "皮蘭",
  "Kotor": "科托爾", "Budva": "布德瓦", "Perast": "佩拉斯特",
  "Sarajevo": "塞拉耶佛", "Mostar": "莫斯塔爾",
  "Belgrade": "貝爾格勒", "Novi Sad": "諾維薩德",
  "Bucharest": "布加勒斯特", "Brasov": "布拉索夫", "Sibiu": "錫比烏", "Sighisoara": "錫吉什瓦拉",
  "Sofia": "索菲亞", "Plovdiv": "普羅夫迪夫", "Veliko Tarnovo": "大特爾諾沃",
  "Athens": "雅典", "Thessaloniki": "塞薩洛尼基", "Santorini": "聖托里尼", "Mykonos": "米克諾斯", "Meteora": "邁泰奧拉", "Zakynthos": "扎金索斯", "Rhodes": "羅德島",
  "Istanbul": "伊斯坦堡", "Ankara": "安卡拉", "Cappadocia": "卡帕多奇亞", "Izmir": "伊茲密爾", "Antalya": "安塔利亞", "Pamukkale": "棉堡",

  // 美洲
  "New York": "紐約", "Los Angeles": "洛杉磯", "San Francisco": "舊金山", "Las Vegas": "拉斯維加斯", "Chicago": "芝加哥", "Miami": "邁阿密", "Seattle": "西雅圖", "Boston": "波士頓", "Washington D.C.": "華盛頓特區",
  "Toronto": "多倫多", "Vancouver": "溫哥華", "Montreal": "蒙特婁", "Quebec City": "魁北克市", "Banff": "班夫",
  "Mexico City": "墨西哥城", "Cancun": "坎昆", "Havana": "哈瓦那",
  "Sao Paulo": "聖保羅", "Rio de Janeiro": "里約熱內盧", "Buenos Aires": "布宜諾斯艾利斯", "Santiago": "聖地牙哥", "Lima": "利馬", "Cusco": "庫斯科", "Bogota": "波哥大",

  // 大洋洲
  "Sydney": "雪梨", "Melbourne": "墨爾本", "Brisbane": "布里斯本", "Perth": "柏斯", "Gold Coast": "黃金海岸", "Cairns": "凱恩斯",
  "Auckland": "奧克蘭", "Christchurch": "基督城", "Queenstown": "皇后鎮", "Wellington": "威靈頓", "Rotorua": "羅托魯瓦",

  // 中東/非洲
  "Dubai": "杜拜", "Abu Dhabi": "阿布達比", "Doha": "杜哈", "Riyadh": "利雅德", "Jerusalem": "耶路撒冷", "Tel Aviv": "特拉維夫", "Petra": "佩特拉", "Amman": "安曼",
  "Cairo": "開羅", "Giza": "吉薩", "Luxor": "路克索", "Aswan": "亞斯文", "Sharm El Sheikh": "沙姆沙伊赫",
  "Merzouga": "梅爾祖卡", "Casablanca": "卡薩布蘭卡", "Rabat": "拉巴特", "Marrakech": "馬拉喀什", "Fes": "費茲", "Chefchaouen": "舍夫沙萬",
  "Cape Town": "開普敦", "Johannesburg": "約翰尼斯堡", "Nairobi": "奈洛比", "Zanzibar": "桑吉巴", "Victoria Falls": "維多利亞瀑布",

  // 微型國家/其他
  "Magistral Palace": "馬爾他宮", "Magistral Villa": "馬爾他部",
  "Monte Carlo": "蒙地卡羅", "Vatican City": "梵蒂岡城", "San Marino": "聖馬利諾", "Vaduz": "瓦都茲", "Luxembourg City": "盧森堡市"
};

const PREDEFINED_CITIES = {
  // === 亞洲 ===
  "Taiwan": ["Taipei", "Kaohsiung", "Taichung", "Tainan", "Taoyuan", "Hsinchu", "Keelung", "Chiayi", "Hualien", "Taitung"],
  "Japan": ["Tokyo", "Osaka", "Kyoto", "Fukuoka", "Sapporo", "Okinawa", "Nagoya", "Nara", "Kobe", "Hiroshima", "Hakone"],
  "South Korea": ["Seoul", "Busan", "Incheon", "Jeju", "Daegu", "Gyeongju"],
  "China": ["Beijing", "Shanghai", "Guangzhou", "Shenzhen", "Chengdu", "Xi'an", "Hangzhou", "Guilin", "Lijiang"],
  "Hong Kong": ["Hong Kong", "Kowloon"],
  "Macao": ["Macao"],
  "Thailand": ["Bangkok", "Chiang Mai", "Phuket", "Krabi", "Pattaya", "Koh Samui", "Ayutthaya"],
  "Vietnam": ["Hanoi", "Ho Chi Minh City", "Da Nang", "Hoi An", "Nha Trang", "Phu Quoc", "Ha Long", "Sapa"],
  "Singapore": ["Singapore"],
  "Malaysia": ["Kuala Lumpur", "Penang", "Malacca", "Langkawi", "Kota Kinabalu"],
  "Philippines": ["Manila", "Cebu", "Boracay", "Palawan", "Davao"],
  "Indonesia": ["Jakarta", "Bali", "Yogyakarta", "Surabaya", "Bandung", "Lombok"],
  "India": ["New Delhi", "Mumbai", "Bangalore", "Chennai", "Kolkata", "Jaipur", "Agra", "Varanasi"],
  "Cambodia": ["Phnom Penh", "Siem Reap", "Sihanoukville"],
  "Myanmar": ["Yangon", "Mandalay", "Bagan", "Inle Lake"],
  "Laos": ["Vientiane", "Luang Prabang", "Vang Vieng"],
  "Nepal": ["Kathmandu", "Pokhara", "Chitwan"],
  "Maldives": ["Male", "Maafushi"],

  // === 歐洲 (含熱門與冷門/小鎮) ===
  "United Kingdom": ["London", "Edinburgh", "Manchester", "Liverpool", "Oxford", "Cambridge", "Bath", "York", "Bristol", "Glasgow", "Belfast", "Cardiff", "Brighton", "Cotswolds", "Inverness"],
  "Ireland": ["Dublin", "Cork", "Galway", "Limerick", "Kilkenny", "Killarney"],
  "France": ["Paris", "Lyon", "Marseille", "Nice", "Bordeaux", "Strasbourg", "Colmar", "Annecy", "Avignon", "Toulouse", "Lille", "Nantes", "Montpellier", "Cannes", "Chamonix", "Mont Saint-Michel", "Saint-Malo", "Aix-en-Provence"],
  "Netherlands": ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Eindhoven", "Maastricht", "Delft", "Giethoorn", "Leiden", "Haarlem"],
  "Belgium": ["Brussels", "Antwerp", "Ghent", "Bruges", "Liege", "Leuven", "Dinant"],
  "Luxembourg": ["Luxembourg City", "Esch-sur-Alzette", "Vianden"],
  "Monaco": ["Monte Carlo", "Monaco-Ville"],
  "Germany": ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne", "Heidelberg", "Dresden", "Nuremberg", "Stuttgart", "Dusseldorf", "Leipzig", "Rothenburg ob der Tauber", "Fussen", "Bremen", "Bonn"],
  "Switzerland": ["Zurich", "Geneva", "Bern", "Lucerne", "Interlaken", "Zermatt", "Basel", "Lausanne", "Grindelwald", "Lauterbrunnen", "Lugano", "Montreux", "St. Moritz"],
  "Austria": ["Vienna", "Salzburg", "Innsbruck", "Graz", "Linz", "Hallstatt", "Bregenz", "Melk"],
  "Liechtenstein": ["Vaduz"],
  "Italy": ["Rome", "Milan", "Venice", "Florence", "Naples", "Pisa", "Verona", "Bologna", "Turin", "Genoa", "Palermo", "Cinque Terre", "Amalfi", "Positano", "Sorrento", "Siena", "Como", "Matera", "Alberobello", "Catania"],
  "Spain": ["Madrid", "Barcelona", "Valencia", "Seville", "Granada", "Malaga", "Bilbao", "Zaragoza", "Cordoba", "Toledo", "Segovia", "Ronda", "San Sebastian", "Ibiza", "Palma", "Santiago de Compostela"],
  "Portugal": ["Lisbon", "Porto", "Sintra", "Faro", "Coimbra", "Braga", "Cascais", "Obidos", "Lagos", "Evora", "Madeira", "Azores"],
  "Greece": ["Athens", "Thessaloniki", "Santorini", "Mykonos", "Crete", "Rhodes", "Corfu", "Zakynthos", "Meteora", "Delphi", "Nafplio"],
  "Turkey": ["Istanbul", "Ankara", "Izmir", "Cappadocia", "Antalya", "Pamukkale", "Bodrum", "Ephesus", "Bursa"],
  "Czech Republic": ["Prague", "Cesky Krumlov", "Brno", "Karlovy Vary", "Plzen", "Olomouc", "Kutna Hora"],
  "Hungary": ["Budapest", "Debrecen", "Eger", "Pecs", "Szentendre", "Tokaj"],
  "Poland": ["Warsaw", "Krakow", "Gdansk", "Wroclaw", "Poznan", "Lodz", "Zakopane", "Torun"],
  "Croatia": ["Zagreb", "Dubrovnik", "Split", "Zadar", "Rijeka", "Pula", "Hvar", "Rovinj", "Plitvice Lakes", "Sibenik"],
  "Slovenia": ["Ljubljana", "Bled", "Piran", "Maribor", "Koper", "Postojna"],
  "Montenegro": ["Podgorica", "Kotor", "Budva", "Perast", "Tivat", "Herceg Novi"],
  "Bosnia and Herzegovina": ["Sarajevo", "Mostar", "Banja Luka", "Blagaj", "Trebinje"],
  "Serbia": ["Belgrade", "Novi Sad", "Nis", "Subotica"],
  "Romania": ["Bucharest", "Brasov", "Sibiu", "Cluj-Napoca", "Timisoara", "Sighisoara", "Sinaia", "Constanta"],
  "Bulgaria": ["Sofia", "Plovdiv", "Varna", "Burgas", "Veliko Tarnovo", "Rila"],
  "North Macedonia": ["Skopje", "Ohrid", "Bitola", "Matka"],
  "Albania": ["Tirana", "Durres", "Berat", "Gjirokaster", "Sarande", "Shkoder", "Vlore"],
  "Kosovo": ["Pristina", "Prizren", "Peja"],
  "Sweden": ["Stockholm", "Gothenburg", "Malmo", "Uppsala", "Kiruna", "Abisko", "Visby", "Lund"],
  "Norway": ["Oslo", "Bergen", "Trondheim", "Stavanger", "Tromso", "Lofoten", "Alesund", "Flam"],
  "Denmark": ["Copenhagen", "Aarhus", "Odense", "Aalborg", "Billund", "Roskilde"],
  "Finland": ["Helsinki", "Rovaniemi", "Turku", "Tampere", "Espoo", "Oulu", "Porvoo"],
  "Iceland": ["Reykjavik", "Vik", "Akureyri", "Hofn", "Selfoss", "Keflavik"],
  "Estonia": ["Tallinn", "Tartu", "Parnu"],
  "Latvia": ["Riga", "Jurmala", "Sigulda"],
  "Lithuania": ["Vilnius", "Kaunas", "Klaipeda", "Trakai", "Siauliai"],
  "Malta": ["Valletta", "Mdina", "Sliema", "St. Julian's", "Gozo", "Marsaxlokk"],
  "Cyprus": ["Nicosia", "Limassol", "Larnaca", "Paphos", "Ayia Napa"],
  "San Marino": ["San Marino", "Serravalle"],
  "Vatican City": ["Vatican City"],
  "Andorra": ["Andorra la Vella"],
  "Sovereign Military Order of Malta": ["Magistral Palace", "Magistral Villa"],
  "Gibraltar": ["Gibraltar"],
  "Russia": ["Moscow", "Saint Petersburg", "Kazan", "Sochi", "Vladivostok", "Irkutsk", "Yekaterinburg"],
  "Ukraine": ["Kyiv", "Lviv", "Odesa", "Kharkiv"],
  "Belarus": ["Minsk", "Brest", "Grodno"],
  "Moldova": ["Chisinau", "Tiraspol"],
  "Georgia": ["Tbilisi", "Batumi", "Kutaisi", "Kazbegi", "Sighnaghi"],
  "Armenia": ["Yerevan", "Gyumri", "Dilijan"],
  "Azerbaijan": ["Baku", "Ganja", "Sheki"],

  // === 美洲 ===
  "United States": ["New York", "Los Angeles", "San Francisco", "Las Vegas", "Chicago", "Miami", "Orlando", "Washington D.C.", "Boston", "Seattle", "San Diego", "Honolulu", "Austin", "New Orleans", "Denver", "Atlanta", "Philadelphia"],
  "Canada": ["Toronto", "Vancouver", "Montreal", "Quebec City", "Ottawa", "Calgary", "Banff", "Whistler", "Victoria", "Halifax"],
  "Mexico": ["Mexico City", "Cancun", "Tulum", "Playa del Carmen", "Guadalajara", "Monterrey", "Oaxaca", "Cabo San Lucas"],
  "Brazil": ["Rio de Janeiro", "Sao Paulo", "Brasilia", "Salvador", "Foz do Iguacu", "Manaus"],
  "Argentina": ["Buenos Aires", "Mendoza", "Bariloche", "Ushuaia", "Cordoba", "El Calafate"],
  "Chile": ["Santiago", "Valparaiso", "San Pedro de Atacama", "Punta Arenas", "Easter Island"],
  "Peru": ["Lima", "Cusco", "Machu Picchu", "Arequipa", "Puno"],
  "Colombia": ["Bogota", "Medellin", "Cartagena", "Cali"],
  "Cuba": ["Havana", "Varadero", "Trinidad"],
  "Costa Rica": ["San Jose", "La Fortuna", "Monteverde", "Manuel Antonio"],
  "Panama": ["Panama City", "Bocas del Toro"],

  // === 大洋洲 ===
  "Australia": ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Cairns", "Canberra", "Hobart", "Darwin", "Alice Springs", "Byron Bay"],
  "New Zealand": ["Auckland", "Wellington", "Christchurch", "Queenstown", "Rotorua", "Dunedin", "Taupo", "Wanaka", "Milford Sound"],
  "Fiji": ["Nadi", "Suva"],
  "Palau": ["Koror"],
  "Guam": ["Tumon", "Hagatna"],

  // === 中東 & 非洲 ===
  "United Arab Emirates": ["Dubai", "Abu Dhabi", "Sharjah"],
  "Qatar": ["Doha"],
  "Saudi Arabia": ["Riyadh", "Jeddah", "Mecca", "Medina", "Al Ula"],
  "Jordan": ["Amman", "Petra", "Wadi Rum", "Aqaba", "Dead Sea"],
  "Israel": ["Jerusalem", "Tel Aviv", "Haifa", "Eilat", "Nazareth"],
  "Egypt": ["Cairo", "Giza", "Luxor", "Aswan", "Hurghada", "Sharm El Sheikh", "Alexandria"],
  "Morocco": ["Marrakech", "Casablanca", "Fes", "Chefchaouen", "Rabat", "Tangier", "Essaouira", "Merzouga", "Ouarzazate", "Agadir"],
  "South Africa": ["Cape Town", "Johannesburg", "Durban", "Pretoria", "Kruger National Park", "Stellenbosch"],
  "Kenya": ["Nairobi", "Mombasa", "Masai Mara"],
  "Tanzania": ["Dar es Salaam", "Zanzibar", "Arusha", "Serengeti", "Kilimanjaro"],
  "Mauritius": ["Port Louis", "Grand Baie"],
  "Seychelles": ["Victoria", "Praslin", "La Digue"],
  "Tunisia": ["Tunis", "Sousse", "Djerba"],
  
  // === 有限承認/屬地/其他 ===
  "Transnistria": ["Tiraspol", "Bendery"],
  "Northern Cyprus": ["North Nicosia", "Kyrenia", "Famagusta"],
  "Abkhazia": ["Sukhumi"],
  "South Ossetia": ["Tskhinvali"],
  "Faroe Islands": ["Torshavn"],
  "Svalbard and Jan Mayen": ["Longyearbyen"]
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

// OSRM 路徑抓取
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [allCountries, setAllCountries] = useState([]);
  const [originCities, setOriginCities] = useState([]);
  const [destCities, setDestCities] = useState([]);
  const [transitCities, setTransitCities] = useState([]); 
  
  // Removed unused setters
  const [isLoadingOriginCities] = useState(false);
  const [isLoadingDestCities] = useState(false);
  const [isLoadingTransitCities] = useState(false);
  
  const [isOriginManual, setIsOriginManual] = useState(false);
  const [isDestManual, setIsDestManual] = useState(false);
  const [isTransitManual, setIsTransitManual] = useState(false); 
  
  const [libLoaded, setLibLoaded] = useState(false);
  const [isPickingMode, setIsPickingMode] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  const [currentMapId, setCurrentMapId] = useState('');
  const [isIdModalOpen, setIsIdModalOpen] = useState(true); 
  const [tempMapIdInput, setTempMapIdInput] = useState(''); 
  const [tempPasswordInput, setTempPasswordInput] = useState('');
  const [idMode, setIdMode] = useState('enter'); 
  const [idError, setIdError] = useState('');
  const [isCheckingId, setIsCheckingId] = useState(false);
  const [showPassword, setShowPassword] = useState(false); 
  const [rememberMe, setRememberMe] = useState(false); 
  
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [showExportPreview, setShowExportPreview] = useState(false); 
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [isCapturing, setIsCapturing] = useState(false); 

  const [stats, setStats] = useState({ countries: 0, cities: 0 });
  const [detailedStats, setDetailedStats] = useState({ countryList: [], cityList: [] }); 
  const [isStatsListOpen, setIsStatsListOpen] = useState(false); 
  
  // ★★★ 新增：卡片折疊狀態 (預設開啟) ★★★
  const [isStatsOpen, setIsStatsOpen] = useState(true);
  const [isTransportOpen, setIsTransportOpen] = useState(true);

  const [formData, setFormData] = useState({
    originCountry: '', originCity: '', originLat: null, originLng: null,
    destCountry: '', destCity: '', destLat: null, destLng: null,
    transitCountry: '', transitCity: '', transitLat: null, transitLng: null,
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
  const pickingLocationMode = useRef(null);
  const latestDataRef = useRef({ trips: [], allCountries: [] });
  const visitedCountriesRef = useRef(new Set()); 

  useEffect(() => {
    latestDataRef.current = { trips, allCountries };
    
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    const activeTrips = trips.filter(t => t.dateStart && t.dateStart <= today);
    const countries = new Set();
    const cities = new Set(); 

    activeTrips.forEach(t => {
        if (t.targetCountry) countries.add(t.targetCountry);
        if (t.destCountry) countries.add(t.destCountry);
        if (t.originCountry) countries.add(t.originCountry);
        
        if (t.originCity && t.originCountry !== 'Taiwan') cities.add(`${t.originCity} (${t.originCountry})`);
        if (t.destCity && t.destCountry !== 'Taiwan') cities.add(`${t.destCity} (${t.destCountry})`);
    });

    countries.delete('Taiwan');
    visitedCountriesRef.current = countries;
    
    setStats({
        countries: countries.size,
        cities: cities.size
    });
    setDetailedStats({
        countryList: Array.from(countries).sort().map(c => getDisplayCountryName(c)),
        cityList: Array.from(cities).sort()
    });

  }, [trips, allCountries]);

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
          if (!mapIdFromUrl && initialPass && initialRemember) {
              setCurrentMapId(initialId);
          }
      }
      
      if (initialPass) setTempPasswordInput(initialPass);
      if (initialRemember) setRememberMe(true);
      
      setIsIdModalOpen(true);
      
      const oldWrappers = document.querySelectorAll('div[style*="z-index: 9999"]');
      oldWrappers.forEach(el => {
          if (el.style.width === '0px' && el.style.height === '0px') {
              el.remove();
          }
      });
  }, []);

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
                  await setDoc(authDocRef, { password: password, createdAt: serverTimestamp() });
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

          if (rememberMe) {
              localStorage.setItem('travel_map_auth', JSON.stringify({ id: cleanId, password: password }));
          } else {
              localStorage.removeItem('travel_map_auth');
          }

          setCurrentMapId(cleanId);
          setIsIdModalOpen(false);
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('map', cleanId);
          try { window.history.pushState({}, '', newUrl); } catch (historyErr) { console.warn("URL update failed", historyErr); }

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
          window.location.reload(); 
      }
  }, []);

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
      try { await signInAnonymously(auth); } catch (error) { console.error("Auth Error:", error); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !currentMapId) return;
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
                    try { parsedRoute = typeof data.routePath === 'string' ? JSON.parse(data.routePath) : data.routePath;
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
        return a.name.localeCompare(b.name);
    });
    setAllCountries(countries);
  }, []);

  // ★★★ 主地圖初始化邏輯 ★★★
  useEffect(() => {
    if (!libLoaded || !mapContainerRef.current || mapInstanceRef.current || !window.L) return;

    const map = window.L.map(mapContainerRef.current, {
        zoomControl: false, // 我們會手動添加並移動位置
        preferCanvas: true
    }).setView([48, 15], 4);

    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // ★★★ 將縮放按鈕改到左上角 ★★★
    window.L.control.zoom({ position: 'topleft' }).addTo(map);
    
    mapInstanceRef.current = map;
    setMapLoaded(true);

    // 載入 GeoJSON 世界地圖
    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
        .then(res => res.json())
        .then(data => {
            if (geoJsonLayerRef.current) map.removeLayer(geoJsonLayerRef.current);
            geoJsonLayerRef.current = window.L.geoJSON(data, {
                style: {
                    fillColor: '#cbd5e1',
                    weight: 1,
                    opacity: 1,
                    color: 'white',
                    fillOpacity: 0.5
                }
            }).addTo(map);
            geoJsonLayerRef.current.bringToBack();
        })
        .catch(err => console.error("GeoJSON Error:", err));
        
    // 點擊事件 (For Picking Location)
    map.on('click', async (e) => {
        if (!pickingLocationMode.current) return;
        
        const { lat, lng } = e.latlng;
        
        // 更新表單座標
        const type = pickingLocationMode.current;
        let updates = {};
        if (type === 'origin') updates = { originLat: lat, originLng: lng };
        else if (type === 'dest') updates = { destLat: lat, destLng: lng };
        else if (type === 'transit') updates = { transitLat: lat, transitLng: lng };
        
        setFormData(prev => ({ ...prev, ...updates }));
        
        // 嘗試反向地理編碼 (Optional)
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
            const data = await res.json();
            if (data && data.address) {
                const city = data.address.city || data.address.town || data.address.village || '';
                if (city) {
                    if (type === 'origin') updates.originCity = city;
                    else if (type === 'dest') updates.destCity = city;
                    else if (type === 'transit') updates.transitCity = city;
                    setFormData(prev => ({ ...prev, ...updates }));
                }
            }
        } catch(err) {
            console.warn("Reverse geocoding failed", err);
        }
        
        // 結束 Picking Mode
        pickingLocationMode.current = null;
        setIsPickingMode(false);
        setIsModalOpen(true); // 重新打開 Modal
    });

  }, [libLoaded]);

  // ★★★ 繪製地圖上的路線與標記 ★★★
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L || !mapLoaded) return;
    
    const map = mapInstanceRef.current;
    
    // 清除舊圖層
    layersRef.current.forEach(layer => map.removeLayer(layer));
    layersRef.current = [];

    // 更新 GeoJSON 高亮
    if (geoJsonLayerRef.current) {
        geoJsonLayerRef.current.eachLayer(layer => {
            let countryName = layer.feature.properties.name || layer.feature.properties.ADMIN;
             const nameMapping = {
                "United States of America": "United States", "USA": "United States",
                "England": "United Kingdom", "Great Britain": "United Kingdom", "UK": "United Kingdom",
                "South Korea": "South Korea", "Republic of Korea": "South Korea", "Korea, South": "South Korea",
                "People's Republic of China": "China", "Republic of Serbia": "Serbia",
                "The Bahamas": "Bahamas", "Bahamas, The": "Bahamas",
                "Myanmar": "Myanmar", "Burma": "Myanmar",
                "Czech Republic": "Czech Republic", "Czechia": "Czech Republic",
                "Macedonia": "North Macedonia", "The former Yugoslav Republic of Macedonia": "North Macedonia"
            };
            if (nameMapping[countryName]) { countryName = nameMapping[countryName]; }
            
            if (visitedCountriesRef.current.has(countryName)) {
                layer.setStyle({ fillColor: '#fcd34d', fillOpacity: 0.8, weight: 1 });
            } else {
                layer.setStyle({ fillColor: '#cbd5e1', weight: 1, opacity: 1, color: 'white', fillOpacity: 0.5 });
            }
        });
    }

    const today = new Date().toISOString().split('T')[0];

    trips.forEach(trip => {
      if (trip.originLat && trip.originLng && trip.destLat && trip.destLng) {
          const typeConfig = TRANSPORT_TYPES[trip.transport] || TRANSPORT_TYPES.plane;
          const isFutureOrNoDate = !trip.dateStart || trip.dateStart > today;
          const lineOptions = { 
              color: typeConfig.color, 
              weight: 3, 
              opacity: 0.7, 
              dashArray: isFutureOrNoDate ? '5, 10' : null 
          };
          
          let polyline;
          
          // 繪製線條
          if (trip.transitLat && trip.transitLng) {
            if (trip.transport === 'plane') {
                const p1 = getGreatCirclePoints(trip.originLat, trip.originLng, trip.transitLat, trip.transitLng);
                const l1 = window.L.polyline(p1, lineOptions).addTo(map);
                layersRef.current.push(l1);
                
                const p2 = getGreatCirclePoints(trip.transitLat, trip.transitLng, trip.destLat, trip.destLng);
                const l2 = window.L.polyline(p2, lineOptions).addTo(map);
                layersRef.current.push(l2);
            } else if (typeConfig.useRoute && trip.routePath && trip.routePath.length > 0) {
                 polyline = window.L.polyline(trip.routePath, lineOptions).addTo(map);
                 layersRef.current.push(polyline);
            } else {
                 const l1 = window.L.polyline([[trip.originLat, trip.originLng], [trip.transitLat, trip.transitLng]], lineOptions).addTo(map);
                 layersRef.current.push(l1);
                 const l2 = window.L.polyline([[trip.transitLat, trip.transitLng], [trip.destLat, trip.destLng]], lineOptions).addTo(map);
                 layersRef.current.push(l2);
            }
            
            // 轉運點標記
            const tm = window.L.circleMarker([trip.transitLat, trip.transitLng], { radius: 3, color: '#666', fillOpacity: 1 }).addTo(map);
            tm.bindPopup(`<b>轉運: ${trip.transitCity}</b>`);
            layersRef.current.push(tm);

          } else {
             if (trip.transport === 'plane') {
                 const curvedPoints = getGreatCirclePoints(trip.originLat, trip.originLng, trip.destLat, trip.destLng);
                 polyline = window.L.polyline(curvedPoints, lineOptions).addTo(map);
                 layersRef.current.push(polyline);
             } else if (typeConfig.useRoute && trip.routePath && trip.routePath.length > 0) {
                 polyline = window.L.polyline(trip.routePath, lineOptions).addTo(map);
                 layersRef.current.push(polyline);
             } else {
                 polyline = window.L.polyline([[trip.originLat, trip.originLng], [trip.destLat, trip.destLng]], lineOptions).addTo(map);
                 layersRef.current.push(polyline);
             }
          }

          // 起訖點標記
          const m1 = window.L.circleMarker([trip.originLat, trip.originLng], { radius: 4, color: typeConfig.color, fillOpacity: 1 }).addTo(map);
          m1.bindPopup(`<b>${trip.originCity}</b><br/>${trip.dateStart}`);
          layersRef.current.push(m1);
          
          const m2 = window.L.circleMarker([trip.destLat, trip.destLng], { radius: 4, color: typeConfig.color, fillOpacity: 1 }).addTo(map);
          m2.bindPopup(`<b>${trip.destCity}</b>`);
          layersRef.current.push(m2);
      }
    });

  }, [trips, mapLoaded]);


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
          const canvas = await window.html2canvas(clone, { useCORS: true, scale: 2, logging: false, allowTaint: true, backgroundColor: '#f1f5f9', ignoreElements: (element) => element.classList.contains('leaflet-control-zoom') });
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
      } finally { setIsCapturing(false); }
  }, []);

  // ★★★ 地圖預覽與繪製邏輯 (優化手機版匯出 9:16) ★★★
  useEffect(() => {
    if (!showExportPreview || !exportPreviewRef.current || !window.L) return;
    exportPreviewRef.current.innerHTML = '';
    
    // 偵測是否為手機版匯出
    const isMobileExport = window.innerWidth < 768;
    const exportWidth = isMobileExport ? 1080 : 1200;
    const exportHeight = isMobileExport ? 1920 : 900;
    
    // ★★★ 取得當前網址 ★★★
    const appUrl = window.location.host;

    const container = document.createElement('div');
    container.style.width = `${exportWidth}px`;
    container.style.height = `${exportHeight}px`;
    container.style.backgroundColor = '#f1f5f9';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.fontFamily = 'sans-serif';
    container.style.position = 'absolute'; 
    // 預覽縮放比例：手機版縮更小以適應視窗
    container.style.transform = isMobileExport ? 'scale(0.2)' : 'scale(0.4)'; 
    container.style.transformOrigin = 'top left';
    exportPreviewRef.current.appendChild(container);

    // ★ 標頭 (9:16 時左右分開對齊)
    const header = document.createElement('div');
    header.style.padding = isMobileExport ? '40px' : '20px';
    header.style.backgroundColor = '#1e3a8a';
    header.style.color = 'white';
    header.style.display = 'flex';
    header.style.flexDirection = 'row'; // 始終維持 row
    header.style.justifyContent = 'space-between';
    header.style.alignItems = isMobileExport ? 'flex-start' : 'center'; // 手機版靠上對齊
    header.style.gap = isMobileExport ? '20px' : '0';
    
    let dateRangeText = "全部時段";
    if (exportStartDate && exportEndDate) {
        dateRangeText = `${exportStartDate} 至 ${exportEndDate}`;
    }

    // 標題 HTML
    const titleSize = isMobileExport ? '48px' : '28px';
    const subTitleSize = isMobileExport ? '28px' : '16px';
    const rangeLabelSize = isMobileExport ? '28px' : '18px';
    const rangeTextSize = isMobileExport ? '24px' : '18px';

    header.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: flex-start;">
            <h1 style="margin:0; font-size: ${titleSize}; font-weight: bold;">🗺️歐洲交換趴趴走</h1>
            <p style="margin:8px 0 0 0; opacity: 0.8; font-size: ${subTitleSize};">${appUrl}</p>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-end; height: 100%; margin-top: auto;">
            <p style="margin:0; font-size: ${rangeLabelSize}; font-weight: bold;">日期區間</p>
            <p style="margin:8px 0 0 0; font-family: monospace; font-size: ${rangeTextSize}; text-align: right;">${dateRangeText}</p>
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
        crossOrigin: 'anonymous', 
        attribution: ''
    }).addTo(exportMap);

    let filteredTrips = trips;
    if (exportStartDate && exportEndDate) {
        filteredTrips = trips.filter(t => {
            if (!t.dateStart) return false;
            return t.dateStart >= exportStartDate && t.dateStart <= exportEndDate;
        });
    }

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

    // ★ 統計卡片 (手機版稍微放大並移到顯眼處)
    const statsCard = document.createElement('div');
    statsCard.style.position = 'absolute';
    // 手機版：放在頂部置中 (地圖上方) 或 右上角但更大
    if (isMobileExport) {
        statsCard.style.top = '40px';
        statsCard.style.right = '40px'; // Move to top-right
        statsCard.style.padding = '30px';
        statsCard.style.borderRadius = '24px';
        // ★★★ 修正手機版匯出圖片空白問題：使用 fit-content ★★★
        statsCard.style.width = 'fit-content'; 
    } else {
        statsCard.style.top = '20px';
        statsCard.style.right = '20px';
        statsCard.style.padding = '15px';
        statsCard.style.borderRadius = '12px';
        statsCard.style.minWidth = '160px';
    }
    
    statsCard.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    statsCard.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.2)';
    statsCard.style.zIndex = '1000';
    statsCard.style.fontFamily = 'sans-serif';
    statsCard.style.border = '1px solid rgba(255, 255, 255, 0.5)';
    statsCard.style.backdropFilter = 'blur(4px)';

    const iconSize = isMobileExport ? '32' : '16';
    const fontSizeTitle = isMobileExport ? '28px' : '14px';
    const fontSizeLabel = isMobileExport ? '24px' : '12px';
    const fontSizeVal = isMobileExport ? '36px' : '18px';
    const gapSize = isMobileExport ? '16px' : '8px';

    // ★★★ 手機版匯出：國家/城市左右並排 (一列三行) ★★★
    let statsContentHtml = '';
    
    if (isMobileExport) {
        statsContentHtml = `
            <div style="display: flex; align-items: center; justify-content: flex-start; gap: 30px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                     <div style="background-color: #fef9c3; padding: 12px; border-radius: 9999px;">
                        <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
                    </div>
                    <span style="font-weight: bold; color: #374151; font-size: ${fontSizeTitle}; white-space: nowrap;">旅程足跡</span>
                </div>
                
                <div style="display: flex; align-items: center; gap: 40px;">
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: ${fontSizeLabel}; color: #6b7280; margin-bottom: 4px;">國家</span>
                        <span style="font-weight: bold; font-size: ${fontSizeVal}; color: #2563eb;">${exportStats.countries}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: ${fontSizeLabel}; color: #6b7280; margin-bottom: 4px;">城市</span>
                        <span style="font-weight: bold; font-size: ${fontSizeVal}; color: #4f46e5;">${exportStats.cities}</span>
                    </div>
                </div>
            </div>
        `;
    } else {
        statsContentHtml = `
            <div style="display: flex; align-items: center; gap: ${gapSize}; margin-bottom: 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; justify-content: center;">
                 <div style="background-color: #fef9c3; padding: 6px; border-radius: 9999px;">
                    <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
                </div>
                <span style="font-weight: bold; color: #374151; font-size: ${fontSizeTitle};">旅程足跡</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: ${gapSize};">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: ${fontSizeLabel}; color: #6b7280;">已造訪國家</span>
                    <span style="font-weight: bold; font-size: ${fontSizeVal}; color: #2563eb;">${exportStats.countries}</span>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: ${fontSizeLabel}; color: #6b7280;">已造訪城市</span>
                    <span style="font-weight: bold; font-size: ${fontSizeVal}; color: #4f46e5;">${exportStats.cities}</span>
                </div>
            </div>
        `;
    }

    statsCard.innerHTML = statsContentHtml;
    mapWrapper.appendChild(statsCard);

    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
        .then(res => res.json())
        .then(data => {
            const visitedCountriesForExport = new Set();
            filteredTrips.forEach(t => {
                if (t.originCountry) visitedCountriesForExport.add(t.originCountry);
                if (t.destCountry) visitedCountriesForExport.add(t.destCountry);
                if (t.targetCountry) visitedCountriesForExport.add(t.targetCountry);
            });
            visitedCountriesForExport.delete('Taiwan');
            
            const geoJsonLayer = L.geoJSON(data, {
                style: { fillColor: '#cbd5e1', weight: 1, opacity: 1, color: 'white', fillOpacity: 0.5 },
                onEachFeature: (feature, layer) => {
                    let countryName = feature.properties.name || feature.properties.ADMIN;
                    const nameMapping = {
                        "United States of America": "United States", "USA": "United States",
                        "England": "United Kingdom", "Great Britain": "United Kingdom", "UK": "United Kingdom",
                        "South Korea": "South Korea", "Republic of Korea": "South Korea", "Korea, South": "South Korea",
                        "People's Republic of China": "China", "Republic of Serbia": "Serbia",
                        "The Bahamas": "Bahamas", "Bahamas, The": "Bahamas",
                        "Myanmar": "Myanmar", "Burma": "Myanmar",
                        "Czech Republic": "Czech Republic", "Czechia": "Czech Republic",
                        "Macedonia": "North Macedonia", "The former Yugoslav Republic of Macedonia": "North Macedonia"
                    };
                    if (nameMapping[countryName]) { countryName = nameMapping[countryName]; }
                    if (visitedCountriesForExport.has(countryName)) {
                        layer.setStyle({ fillColor: '#fcd34d', fillOpacity: 0.8, weight: 1 });
                    }
                }
            }).addTo(exportMap);
            geoJsonLayer.bringToBack();
        })
        .catch(err => { console.error("GeoJSON load failed:", err); });

    const bounds = L.latLngBounds();
    let hasData = false;
    const today = new Date().toISOString().split('T')[0];

    filteredTrips.forEach(trip => {
      if (trip.originLat && trip.originLng && trip.destLat && trip.destLng) {
        hasData = true;
        bounds.extend([trip.originLat, trip.originLng]);
        bounds.extend([trip.destLat, trip.destLng]);

        const typeConfig = TRANSPORT_TYPES[trip.transport] || TRANSPORT_TYPES.plane;
        const isFutureOrNoDate = !trip.dateStart || trip.dateStart > today;
        const lineOptions = { color: typeConfig.color, weight: isMobileExport ? 6 : 4, opacity: 0.8, dashArray: isFutureOrNoDate ? '10, 10' : null };
        let polyline;
        
        if (trip.transitLat && trip.transitLng) {
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
        } else {
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

        L.circleMarker([trip.originLat, trip.originLng], { radius: isMobileExport ? 8 : 5, color: typeConfig.color, fillOpacity: 1 }).addTo(exportMap);
        L.circleMarker([trip.destLat, trip.destLng], { radius: isMobileExport ? 8 : 5, color: typeConfig.color, fillOpacity: 1 }).addTo(exportMap);
      }
    });

    if (hasData && bounds.isValid()) {
        exportMap.fitBounds(bounds, { padding: isMobileExport ? [100, 200] : [50, 50] });
    } else {
        exportMap.setView([48, 15], 4);
    }

    const legend = document.createElement('div');
    legend.style.padding = isMobileExport ? '40px' : '15px 20px';
    legend.style.backgroundColor = 'white';
    legend.style.borderTop = '1px solid #e2e8f0';
    legend.style.display = 'flex';
    legend.style.gap = isMobileExport ? '30px' : '20px';
    legend.style.justifyContent = 'center';
    legend.style.flexWrap = 'wrap'; // 允許換行
    
    const legendTextSize = isMobileExport ? '24px' : '14px';
    const legendIconW = isMobileExport ? '36px' : '24px';
    const legendIconH = isMobileExport ? '10px' : '6px';

    let legendHtml = '';
    Object.entries(TRANSPORT_TYPES).forEach(([key, type]) => {
        legendHtml += `<div style="display: flex; align-items: center; gap: 8px;"><div style="width: ${legendIconW}; height: ${legendIconH}; background-color: ${type.color}; border-radius: 4px;"></div><span style="font-size: ${legendTextSize}; color: #334155; font-weight: bold;">${type.label}</span></div>`;
    });
    legend.innerHTML = legendHtml;
    container.appendChild(legend);
    container._exportMap = exportMap;
    return () => { if (container._exportMap) { container._exportMap.remove(); } };
  }, [showExportPreview, exportStartDate, exportEndDate, trips, currentMapId, downloadImage]);

  // ★★★ Helper Functions that were missing ★★★

  const openModal = (targetCountry, tripToEdit = null) => {
    if (tripToEdit) {
      setEditingId(tripToEdit.id);
      setFormData({
        originCountry: tripToEdit.originCountry || '', originCity: tripToEdit.originCity || '', originLat: tripToEdit.originLat, originLng: tripToEdit.originLng,
        destCountry: tripToEdit.destCountry || '', destCity: tripToEdit.destCity || '', destLat: tripToEdit.destLat, destLng: tripToEdit.destLng,
        transitCountry: tripToEdit.transitCountry || '', transitCity: tripToEdit.transitCity || '', transitLat: tripToEdit.transitLat, transitLng: tripToEdit.transitLng,
        dateStart: tripToEdit.dateStart || '', timeStart: tripToEdit.timeStart || '', dateEnd: tripToEdit.dateEnd || '', timeEnd: tripToEdit.timeEnd || '',
        transport: tripToEdit.transport || 'plane', cost: tripToEdit.cost || '', currency: tripToEdit.currency || 'EUR',
        transportNumber: tripToEdit.transportNumber || '', seatNumber: tripToEdit.seatNumber || '', seatType: tripToEdit.seatType || '', notes: tripToEdit.notes || '',
        targetCountry: tripToEdit.targetCountry || '', routePath: tripToEdit.routePath || null
      });
    } else {
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
    }
    setIsModalOpen(true);
  };

  const startPicking = (type) => {
    pickingLocationMode.current = type;
    setIsPickingMode(true);
    setIsModalOpen(false); // Hide modal to let user pick on map
  };

  const requestDelete = (e, id) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
      if (!deleteConfirmId || !currentMapId) return;
      try {
          await deleteDoc(doc(db, 'artifacts', appId, 'users', currentMapId, 'travel_trips', deleteConfirmId));
          setDeleteConfirmId(null);
      } catch (e) {
          console.error("Delete error", e);
          alert("刪除失敗");
      }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentMapId) { alert("請先登入或建立地圖 ID"); return; }
    
    setIsSaving(true);
    try {
        const tripData = {
            ...formData,
            updatedAt: serverTimestamp()
        };
        
        // 如果是開車/火車/巴士，且有起訖點座標，嘗試抓取路徑
        const typeConfig = TRANSPORT_TYPES[formData.transport];
        if (typeConfig && typeConfig.useRoute && formData.originLat && formData.destLat) {
             const path = await fetchRoutePath(formData.originLat, formData.originLng, formData.destLat, formData.destLng, formData.transitLat, formData.transitLng);
             if (path) {
                 tripData.routePath = JSON.stringify(path); // Firestore doesn't like nested arrays sometimes, or just to be safe
             }
        }
        
        // 決定主要的「目標國家」(用於統計)
        if (!tripData.targetCountry) {
            if (tripData.destCountry && tripData.destCountry !== 'Taiwan') tripData.targetCountry = tripData.destCountry;
            else if (tripData.originCountry && tripData.originCountry !== 'Taiwan') tripData.targetCountry = tripData.originCountry;
        }

        if (editingId) {
            await updateDoc(doc(db, 'artifacts', appId, 'users', currentMapId, 'travel_trips', editingId), tripData);
        } else {
            tripData.createdAt = serverTimestamp();
            await addDoc(collection(db, 'artifacts', appId, 'users', currentMapId, 'travel_trips'), tripData);
        }
        
        setIsModalOpen(false);
    } catch (err) {
        console.error("Save error:", err);
        alert("儲存失敗: " + err.message);
    } finally {
        setIsSaving(false);
    }
  };

  // 替換原本可能有問題的 fetchCitiesForCountry，改為正規的 Render Function
  const renderCityInput = (type) => {
    let cities, isLoading, isManual, setManual, fieldCountry, fieldCity, fieldLat, fieldLng, label, placeholder;
    
    if (type === 'origin') { 
        cities = originCities; 
        isLoading = isLoadingOriginCities; 
        isManual = isOriginManual; 
        setManual = setIsOriginManual; 
        fieldCountry = 'originCountry'; 
        fieldCity = 'originCity'; 
        fieldLat = 'originLat'; 
        fieldLng = 'originLng'; 
        label = '出發城市/地點'; 
        placeholder = '例如: 台北'; 
    } else if (type === 'dest') { 
        cities = destCities; 
        isLoading = isLoadingDestCities; 
        isManual = isDestManual; 
        setManual = setIsDestManual; 
        fieldCountry = 'destCountry'; 
        fieldCity = 'destCity'; 
        fieldLat = 'destLat'; 
        fieldLng = 'destLng'; 
        label = '抵達城市/地點'; 
        placeholder = '例如: 東京'; 
    } else { 
        cities = transitCities; 
        isLoading = isLoadingTransitCities; 
        isManual = isTransitManual; 
        setManual = setIsTransitManual; 
        fieldCountry = 'transitCountry'; 
        fieldCity = 'transitCity'; 
        fieldLat = 'transitLat'; 
        fieldLng = 'transitLng'; 
        label = '中途轉運點 (選填)'; 
        placeholder = '例如: 香港'; 
    }
    
    // Fetch cities helper inside
    const handleCountryChange = async (e) => {
        const newCountry = e.target.value;
        
        if (type === 'origin') {
             setFormData(prev => ({ 
                 ...prev, 
                 originCountry: newCountry, originCity: '', originLat: null, originLng: null, 
                 // Smart default: set dest country same if empty? No, keep separate.
                 // But logic in snippet was setting destCountry too? Let's keep it simple.
             }));
             // Trigger fetching cities logic (simulated by just setting state for now, assuming external fetch or predefined)
             if (PREDEFINED_CITIES[newCountry]) {
                 setOriginCities(PREDEFINED_CITIES[newCountry].map(c => ({ value: c, label: getDisplayCityName(c) })));
             } else {
                 setOriginCities([]);
             }
        } else if (type === 'dest') {
             setFormData(prev => ({ ...prev, destCountry: newCountry, destCity: '', destLat: null, destLng: null }));
             if (PREDEFINED_CITIES[newCountry]) {
                 setDestCities(PREDEFINED_CITIES[newCountry].map(c => ({ value: c, label: getDisplayCityName(c) })));
             } else {
                 setDestCities([]);
             }
        } else {
             setFormData(prev => ({ ...prev, transitCountry: newCountry, transitCity: '', transitLat: null, transitLng: null }));
             if (PREDEFINED_CITIES[newCountry]) {
                 setTransitCities(PREDEFINED_CITIES[newCountry].map(c => ({ value: c, label: getDisplayCityName(c) })));
             } else {
                 setTransitCities([]);
             }
        }
    };

    const currentCityValue = formData[fieldCity];
    const isCityInList = cities.some(c => c.value === currentCityValue);
    
    return (
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700 flex justify-between">{label}{isLoading && <span className="text-xs text-blue-500 font-normal flex items-center gap-1"><RefreshCw size={10} className="animate-spin"/> 載入城市中...</span>}</label>
        <div className="mb-2">
            <select className="w-full p-2 border rounded text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none" value={formData[fieldCountry]}
                onChange={handleCountryChange}
            >
                <option value="">{type === 'transit' ? '無 (直達)' : '請選擇國家'}</option>
                {allCountries.map(c => (<option key={c.name} value={c.name}>{c.label}</option>))}
            </select>
        </div>
        {formData[fieldCountry] && (
            <div className="flex gap-2">
                {!isManual ? (
                    <select className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white" value={currentCityValue}
                    onChange={async (e) => {
                        if (e.target.value === 'MANUAL_ENTRY') { setManual(true); setFormData({ ...formData, [fieldCity]: '' }); return; }
                        const newCity = e.target.value;
                        const newFormData = { ...formData, [fieldCity]: newCity };
                        const coords = await fetchCoordinates(newCity, formData[fieldCountry]);
                        if (coords) { newFormData[fieldLat] = coords.lat; newFormData[fieldLng] = coords.lng; }
                        setFormData(newFormData);
                    }}>
                    <option value="" disabled>請選擇城市</option>
                    {!isCityInList && currentCityValue && <option value={currentCityValue}>{currentCityValue}</option>}
                    {cities.map(city => (<option key={city.value} value={city.value}>{city.label}</option>))}
                    <option value="MANUAL_ENTRY" className="font-bold text-blue-600 border-t">✏️ 自行輸入...</option>
                    </select>
                ) : (
                    <div className="flex-1 relative">
                        <input type="text" placeholder={placeholder} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none" value={formData[fieldCity]} onChange={e => setFormData({...formData, [fieldCity]: e.target.value})} />
                        <button type="button" onClick={() => { setManual(false); }} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-blue-600 bg-white px-2 py-1 rounded border hover:bg-gray-50">選單</button>
                    </div>
                )}
            <button type="button" onClick={() => startPicking(type)} className={`p-2 rounded border ${formData[fieldLat] ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-100'}`} title="在地圖上標記位置"><MapPin size={20} /></button>
            </div>
        )}
        {formData[fieldLat] && <span className="text-xs text-green-600 flex items-center gap-1"><Check size={10} /> 已設定座標</span>}
      </div>
    );
  };

  return (
    <div className="flex flex-col fixed inset-0 w-full bg-gray-100 font-sans text-gray-800 safe-area-inset-bottom overflow-hidden">
      
      <header className="bg-blue-900 text-white p-4 shadow-md flex items-center justify-between z-20 pt-[env(safe-area-inset-top,20px)]">
        <div className="flex items-center gap-2"><Map className="w-6 h-6" /><div><h1 className="text-xl font-bold tracking-wide">🗺️歐洲交換趴趴走</h1>{currentMapId && (<div className="flex items-center gap-1 mt-1"><div className="font-mono bg-blue-800 px-1.5 rounded inline-block text-xs opacity-90">ID: {currentMapId}</div><button onClick={handleShare} className="hover:text-yellow-300" title="複製連結"><Share2 size={12}/></button></div>)}</div></div>
        <div className="flex items-center gap-3">
          <div className="text-xs opacity-70 hidden sm:block">{loading ? '載入中...' : `已記錄 ${trips.length} 趟旅程`}</div>
          <button onClick={() => { setIsExportModalOpen(true); setShowExportPreview(true); }} className="flex items-center gap-1 bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded text-sm transition-colors" title="匯出地圖圖片"><Download size={16} /><span className="hidden sm:inline">匯出圖片</span></button>
          <button onClick={handleSwitchMap} className="flex items-center gap-1 bg-blue-800 hover:bg-blue-700 px-3 py-1.5 rounded text-sm transition-colors border border-blue-700" title="建立/切換地圖"><LogOut size={16} /><span className="hidden sm:inline">切換地圖</span></button>
          {!isSidebarOpen && (<button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-1 rounded hover:bg-blue-800"><Menu size={24} /></button>)}
        </div>
      </header>

      <div className="flex-1 relative overflow-hidden flex">
        <div className={`absolute z-[1000] top-0 left-0 h-full bg-white shadow-2xl transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-full sm:w-96 flex flex-col`}>
          <div className="p-4 border-b flex justify-between items-center bg-gray-50"><h2 className="font-bold text-gray-700">旅程列表</h2><button onClick={() => setIsSidebarOpen(false)} className="p-2 rounded hover:bg-gray-200"><ChevronLeft size={24} /></button></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 md:pb-4">
            {trips.map(trip => (
                <div key={trip.id} onClick={() => openModal(trip.targetCountry, trip)} className="bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow relative group cursor-pointer hover:border-blue-400">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="p-1.5 rounded-full text-white" style={{ backgroundColor: TRANSPORT_TYPES[trip.transport]?.color || '#999' }}>{React.createElement(TRANSPORT_TYPES[trip.transport]?.icon || Plane, { size: 14 })}</span>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{TRANSPORT_TYPES[trip.transport]?.label}</span>
                    <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">{safeDateDisplay(trip.dateStart)} {trip.timeStart && (<span className="font-mono bg-gray-100 px-1 rounded text-blue-600">{trip.timeStart}{trip.timeEnd ? `-${trip.timeEnd}` : ''}</span>)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold mb-1">
                    <div className="truncate max-w-[80px]" title={trip.originCity}>{trip.originCity}</div>
                    {trip.transitCity ? (<><span className="text-gray-400 text-xs">➝</span><div className="bg-gray-100 px-1 rounded text-xs text-gray-600 truncate max-w-[60px]" title={`轉機: ${trip.transitCity}`}>{trip.transitCity}</div><span className="text-gray-400 text-xs">➝</span></>) : (<span className="text-gray-400">➝</span>)}
                    <div className="truncate max-w-[80px]" title={trip.destCity}>{trip.destCity}</div>
                  </div>
                  {trip.targetCountry && (<div className="text-xs text-blue-600 mb-2 bg-blue-50 inline-block px-1.5 py-0.5 rounded">{getDisplayCountryName(trip.targetCountry)}</div>)}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><div className="p-1.5 text-gray-400 bg-gray-100 rounded-full"><Edit2 size={12} /></div><button onClick={(e) => requestDelete(e, trip.id)} className="p-1.5 text-red-400 hover:text-red-500 bg-red-50 rounded-full hover:bg-red-100" title="刪除"><Trash2 size={12} /></button></div>
                </div>
              ))}
          </div>
          <div className="p-4 border-t bg-gray-50 md:static fixed bottom-0 left-0 w-full z-10 md:z-auto shadow-inner md:shadow-none pb-[env(safe-area-inset-bottom,20px)]"><button onClick={() => openModal('')} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg flex items-center justify-center gap-2 shadow transition-colors font-bold text-lg"><Plus size={20} /> 新增旅程</button></div>
        </div>

        {!isSidebarOpen && (<button onClick={() => setIsSidebarOpen(true)} className="absolute top-4 left-4 z-[500] bg-white p-2 rounded-full shadow-lg hover:bg-gray-100 hidden md:block"><ChevronRight size={20} /></button>)}
        {isPickingMode && (<div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-blue-600 text-white px-6 py-3 rounded-full shadow-xl animate-bounce flex items-center gap-2 pointer-events-none"><MapPin size={20} /><span className="font-bold">請在地圖上點擊位置</span><span className="text-sm opacity-90 ml-2">({pickingLocationMode.current === 'origin' ? '出發地' : pickingLocationMode.current === 'dest' ? '目的地' : '轉運點'})</span></div>)}

        <div className="w-full h-full z-0 bg-slate-200 relative flex flex-col">
          <div ref={mapContainerRef} className="flex-1 relative" />
          
          {/* 旅程足跡卡片 (置中靠右，可折疊) */}
          <div className="absolute top-2 right-2 z-[400] flex flex-col items-end pointer-events-none pt-[env(safe-area-inset-top,0px)]">
            <div className="pointer-events-auto bg-white/95 backdrop-blur p-3 rounded-xl shadow-2xl border border-white/50 w-[180px] transition-all">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100 mb-2 cursor-pointer" onClick={() => setIsStatsOpen(!isStatsOpen)}>
                    <div className="flex items-center gap-2">
                        <div className="bg-yellow-100 p-1 rounded-full"><Trophy size={14} className="text-yellow-600" /></div>
                        <span className="font-bold text-gray-700 text-sm">旅程足跡</span>
                    </div>
                    <button className="text-gray-400">{isStatsOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>
                </div>
                
                {isStatsOpen && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between"><span className="text-xs text-gray-500">已造訪國家</span><span className="font-bold text-lg text-blue-600">{stats.countries}</span></div>
                        <div className="flex items-center justify-between"><span className="text-xs text-gray-500">已造訪城市</span><span className="font-bold text-lg text-indigo-600">{stats.cities}</span></div>
                        <button onClick={() => setIsStatsListOpen(true)} className="w-full mt-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 py-1.5 rounded transition-colors flex items-center justify-center gap-1"><List size={12} /> 查看清單</button>
                    </div>
                )}
            </div>
          </div>

          {/* 手機版新增旅程按鈕 (左下角) */}
          <button 
            onClick={() => openModal('')} 
            className="absolute bottom-[70px] left-4 z-[400] md:hidden bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-transform active:scale-95 flex items-center justify-center"
            title="新增旅程"
          >
            <Plus size={24} />
          </button>

          {/* 交通方式卡片 (置底靠右，可折疊，在廣告上方) */}
          <div className="absolute bottom-[70px] md:bottom-[110px] right-2 z-[400] pointer-events-none">
             <div className="pointer-events-auto bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-xl border border-gray-200 w-[240px]">
                 <div className="flex items-center justify-between cursor-pointer mb-2 pb-1 border-b border-gray-100" onClick={() => setIsTransportOpen(!isTransportOpen)}>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">交通方式</h4>
                    <button className="text-gray-400">{isTransportOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>
                 </div>
                 
                 {isTransportOpen && (
                     <>
                         <div className="grid grid-cols-5 gap-2">
                            {Object.entries(TRANSPORT_TYPES).map(([key, type]) => (
                                <div key={key} className="flex flex-col items-center gap-1">
                                    <div className="w-full h-1 rounded-full" style={{ backgroundColor: type.color }}></div>
                                    <span className="text-[10px] font-bold text-gray-600 text-center leading-tight">{type.label}</span>
                                </div>
                            ))}
                         </div>
                         <div className="mt-2 pt-2 border-t text-[10px] text-gray-400 text-center">虛線代表未定/未來行程</div>
                     </>
                 )}
             </div>
          </div>
        </div>
      </div>
      
      {/* 廣告區塊 */}
      <div className="absolute bottom-0 w-full bg-gray-100 border-t border-gray-200 shrink-0 z-20 flex justify-center items-center p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <div className="w-full max-w-[728px] h-[45px] md:h-[90px] bg-white border-2 border-dashed border-gray-300 rounded-lg flex flex-col justify-center items-center text-gray-400">
            <span className="font-bold">Google AdSense</span>
            <span className="text-xs">(此處為廣告預留位置)</span>
        </div>
      </div>

      {isStatsListOpen && (
        <div className="fixed inset-0 z-[2200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b bg-gray-50 rounded-t-xl"><h3 className="font-bold text-gray-800 flex items-center gap-2"><Trophy size={18} className="text-yellow-600" /> 足跡清單</h3><button onClick={() => setIsStatsListOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200"><X size={20} /></button></div>
                <div className="p-4 overflow-y-auto">
                    <div className="mb-6"><h4 className="text-xs font-bold text-gray-500 uppercase mb-2">已造訪國家 ({detailedStats.countryList.length})</h4><div className="flex flex-wrap gap-2">{detailedStats.countryList.map(c => (<span key={c} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm border border-blue-100">{c}</span>))}</div></div>
                    <div><h4 className="text-xs font-bold text-gray-500 uppercase mb-2">已造訪城市 ({detailedStats.cityList.length})</h4><div className="grid grid-cols-2 gap-2">{detailedStats.cityList.map(c => (<div key={c} className="text-sm text-gray-700 bg-gray-50 px-2 py-1.5 rounded border border-gray-100 truncate" title={c}>{c}</div>))}</div></div>
                </div>
            </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6 border-b pb-4"><h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">{editingId ? <Edit2 className="text-blue-600" /> : <PlusCircle className="text-blue-600" />}{editingId ? '編輯旅程' : '新增旅程'}</h2><button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors"><X size={24} /></button></div>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100"><h3 className="font-bold text-gray-600 flex items-center gap-2"><MapPin size={18} /> 旅程起訖點</h3>{renderCityInput('origin')}<div className="pl-4 border-l-2 border-dashed border-gray-300 ml-2 relative"><div className="absolute -left-[9px] top-1/2 -translate-y-1/2 bg-gray-100 text-gray-400 rounded-full p-0.5"><ArrowRight size={12} /></div>{renderCityInput('transit')}</div>{renderCityInput('dest')}</div>
                <div className="space-y-6">
                    <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100"><h3 className="font-bold text-gray-600 flex items-center gap-2"><Calendar size={18} /> 時間設定</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">出發時間</label><div className="flex gap-2"><input type="date" required className="flex-1 p-2 border rounded bg-white" value={formData.dateStart} onChange={e => setFormData({...formData, dateStart: e.target.value})}/><TimeSelector value={formData.timeStart} onChange={val => setFormData({...formData, timeStart: val})} /></div></div><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">抵達時間 (選填)</label><div className="flex gap-2"><input type="date" className="flex-1 p-2 border rounded bg-white" value={formData.dateEnd} onChange={e => setFormData({...formData, dateEnd: e.target.value})}/><TimeSelector value={formData.timeEnd} onChange={val => setFormData({...formData, timeEnd: val})} /></div></div></div></div>
                    <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100"><h3 className="font-bold text-gray-600 flex items-center gap-2"><Plane size={18} /> 交通方式</h3><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">類型</label><div className="grid grid-cols-5 gap-1">{Object.entries(TRANSPORT_TYPES).map(([key, type]) => (<button key={key} type="button" onClick={() => setFormData({...formData, transport: key})} className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${formData.transport === key ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{React.createElement(type.icon, { size: 20 })}<span className="text-[10px] mt-1">{type.label}</span></button>))}</div></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">班次/號碼</label><div className="flex items-center bg-white border rounded px-2"><Ticket size={14} className="text-gray-400 mr-2"/><input type="text" placeholder="例如: BR87" className="w-full p-2 text-sm outline-none" value={formData.transportNumber} onChange={e => setFormData({...formData, transportNumber: e.target.value})}/></div></div><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">座位號碼</label><div className="flex items-center bg-white border rounded px-2"><Armchair size={14} className="text-gray-400 mr-2"/><input type="text" placeholder="例如: 12A" className="w-full p-2 text-sm outline-none" value={formData.seatNumber} onChange={e => setFormData({...formData, seatNumber: e.target.value})}/></div></div><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">位置</label><select className="w-full p-2 border rounded bg-white text-sm h-[38px]" value={formData.seatType} onChange={e => setFormData({...formData, seatType: e.target.value})}><option value="" disabled>請選擇</option>{Object.entries(SEAT_TYPES).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}</select></div></div></div>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100"><h3 className="font-bold text-gray-600 flex items-center gap-2"><DollarSign size={18} /> 其他資訊</h3><div className="flex gap-4"><div className="flex-1"><label className="block text-xs font-bold text-gray-500 uppercase mb-1">費用</label><div className="flex"><select className="p-2 border rounded-l bg-gray-100 border-r-0 text-sm font-bold w-20" value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}</select><input type="number" placeholder="0" className="w-full p-2 border rounded-r focus:ring-2 focus:ring-blue-500 focus:outline-none" value={formData.cost} onChange={e => setFormData({...formData, cost: e.target.value})}/></div></div></div><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">備註 / 筆記</label><div className="relative"><FileText className="absolute top-3 left-3 text-gray-400" size={16} /><textarea className="w-full pl-10 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[80px]" placeholder="寫點什麼..." value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}/></div></div></div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-bold hover:bg-gray-50 transition-colors">取消</button><button type="submit" disabled={isSaving} className="px-8 py-2.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-70 flex items-center gap-2">{isSaving ? (<><Loader className="animate-spin" size={18} /> 儲存中...</>) : (<><Check size={18} /> 儲存旅程</>)}</button></div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isIdModalOpen && (
          <div className="fixed inset-0 z-[3000] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
              <div className="flex border-b"><button onClick={() => { setIdMode('enter'); setIdError(''); }} className={`flex-1 py-4 font-bold text-center transition-colors ${idMode === 'enter' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}><div className="flex items-center justify-center gap-2"><LogIn size={18} /> 進入我的地圖</div></button><button onClick={() => { setIdMode('create'); setIdError(''); }} className={`flex-1 py-4 font-bold text-center transition-colors ${idMode === 'create' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}><div className="flex items-center justify-center gap-2"><PlusCircle size={18} /> 建立新地圖</div></button></div>
              <div className="p-8">
                <div className="text-center mb-6"><div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600"><Globe size={32} /></div><h2 className="text-2xl font-bold text-gray-800">{idMode === 'enter' ? '歡迎回來！' : '開始新的旅程'}</h2><p className="text-gray-500 mt-2 text-sm">{idMode === 'enter' ? '請輸入 ID 與密碼以進入您的地圖' : '請設定專屬 ID 與密碼來建立新地圖'}</p></div>
                <form onSubmit={handleIdSubmit} className="space-y-4">
                  <div><label className="block text-sm font-bold text-gray-700 mb-1">地圖 ID (英文或數字)</label><input type="text" required placeholder="例如: my-trip-2025" className={`w-full p-4 border-2 rounded-xl text-lg outline-none transition-colors ${idError ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'}`} value={tempMapIdInput} onChange={(e) => { setTempMapIdInput(e.target.value); setIdError(''); }} /></div>
                  <div><label className="block text-sm font-bold text-gray-700 mb-1">{idMode === 'enter' ? '輸入密碼' : '設定密碼 (4-6位數字)'}</label><div className="relative"><Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} /><input type={showPassword ? "text" : "password"} required placeholder="••••••" maxLength={6} className={`w-full pl-12 pr-12 p-4 border-2 rounded-xl text-lg outline-none transition-colors ${idError ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'}`} value={tempPasswordInput} onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); setTempPasswordInput(val); setIdError(''); }} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></div>
                  <div className="flex items-center gap-2"><input type="checkbox" id="rememberMe" className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /><label htmlFor="rememberMe" className="text-sm text-gray-600 cursor-pointer select-none">記住 ID 與密碼 (下次自動登入)</label></div>
                  {idError && <p className="text-red-500 text-sm font-bold text-center bg-red-50 p-2 rounded">{idError}</p>}
                  <button type="submit" disabled={isCheckingId} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">{isCheckingId ? <Loader className="animate-spin" /> : (idMode === 'enter' ? '進入地圖 ➔' : '建立地圖 🚀')}</button>
                </form>
                <div className="mt-6 text-center bg-blue-50 p-3 rounded-lg"><p className="text-xs text-blue-600 font-medium">💡 請牢記您的 ID 與密碼，遺失無法找回！</p></div>
              </div>
            </div>
          </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 z-[2100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200 text-center">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600"><AlertTriangle size={24} /></div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">確定要刪除這筆紀錄嗎？</h3>
            <p className="text-sm text-gray-500 mb-6">刪除後將無法復原，您確定要繼續嗎？</p>
            <div className="flex gap-3 justify-center"><button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors">取消</button><button onClick={confirmDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow transition-colors">確認刪除</button></div>
          </div>
        </div>
      )}

      {isExportModalOpen && (
        <div className="fixed inset-0 z-[3000] bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <Download size={20} className="text-blue-600"/> 匯出地圖圖片
                </h2>
                <button onClick={() => { setIsExportModalOpen(false); setShowExportPreview(false); }} className="p-2 hover:bg-gray-200 rounded-full">
                <X size={24} className="text-gray-500" />
                </button>
            </div>
            
            {/* ★★★ 優化手機版匯出選單排版：垂直排列 ★★★ */}
            <div className="p-4 bg-blue-50 flex flex-col md:flex-row flex-wrap gap-4 items-stretch md:items-end border-b">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">開始日期</label>
                    <input type="date" className="w-full p-2 border rounded" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} />
                </div>
                <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">結束日期</label>
                    <input type="date" className="w-full p-2 border rounded" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} />
                </div>
                <button onClick={downloadImage} disabled={isCapturing} className="w-full md:w-auto ml-auto px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded shadow flex items-center justify-center gap-2">
                    {isCapturing ? <Loader className="animate-spin"/> : <Download size={18}/>}
                    下載圖片 (.PNG)
                </button>
            </div>

            <div className="flex-1 overflow-auto bg-gray-100 p-4 flex justify-center items-center relative">
                <div className="shadow-2xl border-4 border-white rounded-lg overflow-hidden relative" style={{ minWidth: '300px', minHeight: '500px' }}>
                    <div ref={exportPreviewRef}></div> 
                </div>
            </div>
            </div>
        </div>
      )}
    </div>
  );
}
