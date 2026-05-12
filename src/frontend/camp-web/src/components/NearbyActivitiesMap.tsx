import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type NearbyActivityCategory = 'base' | 'viewpoint' | 'trekking' | 'water' | 'ride' | 'nature' | 'roadtrip' | 'history';

type NearbyActivity = {
  id: string;
  title: string;
  category: NearbyActivityCategory;
  coordinates: {
    lat: number;
    lng: number;
  };
  summary: string;
  price: string;
  duration: string;
  sourceLabel: string;
  sourceUrl: string;
};

const kuraiMountainAltaiImage = new URL('../assets/camp/kurai-mountain-altai.jpg', import.meta.url).href;
const kuraiSteppeHorsesImage = new URL('../assets/camp/kurai-steppe-horses.jpg', import.meta.url).href;
const kuraiSteppeGrasslandImage = new URL('../assets/camp/kurai-steppe-grassland.jpg', import.meta.url).href;
const altaiSnowMountainsImage = new URL('../assets/camp/altai-snow-mountains.jpg', import.meta.url).href;
const altaiYakSteppeImage = new URL('../assets/camp/altai-yak-steppe.jpg', import.meta.url).href;

const CAMP_COORDINATES = {
  lat: 50.228723,
  lng: 87.929919,
};

const categoryLabels: Record<NearbyActivityCategory, string> = {
  base: 'База',
  viewpoint: 'Виды',
  trekking: 'Треккинг',
  water: 'Вода',
  ride: 'Техника',
  nature: 'Природа',
  roadtrip: 'Автомаршрут',
  history: 'История',
};

const categoryColors: Record<NearbyActivityCategory, string> = {
  base: '#285f4c',
  viewpoint: '#b7653f',
  trekking: '#476d99',
  water: '#347e99',
  ride: '#8c6b2f',
  nature: '#4c7d45',
  roadtrip: '#9d5d7a',
  history: '#7c5a3b',
};

const categoryImages: Record<NearbyActivityCategory, string[]> = {
  base: [kuraiSteppeHorsesImage, kuraiMountainAltaiImage],
  viewpoint: [kuraiMountainAltaiImage, altaiSnowMountainsImage],
  trekking: [altaiSnowMountainsImage, kuraiMountainAltaiImage],
  water: [kuraiSteppeGrasslandImage, altaiSnowMountainsImage],
  ride: [kuraiSteppeGrasslandImage, kuraiSteppeHorsesImage],
  nature: [kuraiSteppeGrasslandImage, altaiYakSteppeImage],
  roadtrip: [kuraiSteppeHorsesImage, kuraiSteppeGrasslandImage],
  history: [kuraiMountainAltaiImage, kuraiSteppeGrasslandImage],
};

const nearbyActivities: NearbyActivity[] = [
  {
    id: 'ekoail',
    title: 'Экоаил, точка кэмпа',
    category: 'base',
    coordinates: CAMP_COORDINATES,
    summary: 'Стартовая точка: ул. Мира, 7а, с. Курай. Отсюда удобно смотреть Курайскую степь и Северо-Чуйский хребет.',
    price: 'Входит в программу кэмпа',
    duration: 'На территории',
    sourceLabel: '2ГИС',
    sourceUrl: 'https://2gis.ru/gornoaltaysk/firm/70000001077460445',
  },
  {
    id: 'chuya-meanders',
    title: 'Чуйские меандры',
    category: 'viewpoint',
    coordinates: {
      lat: 50.234419,
      lng: 87.870956,
    },
    summary: 'Смотровая на изгибы Чуи в Курайской степи. Лучше планировать на ясную погоду и закатный свет.',
    price: 'Самостоятельно бесплатно; экскурсии встречаются от 2 000 ₽/чел.',
    duration: '2-3 часа',
    sourceLabel: 'координаты и цена',
    sourceUrl: 'https://podari-altai.ru/chuyskie-meandry/',
  },
  {
    id: 'kurai-ripples',
    title: 'Гигантская рябь течения',
    category: 'nature',
    coordinates: {
      lat: 50.168575,
      lng: 87.912236,
    },
    summary: 'Редкий ледниковый рельеф Курайской степи: волны на земле, оставшиеся после древних прорывных паводков.',
    price: 'Самостоятельно бесплатно; гид по договоренности',
    duration: '1-2 часа',
    sourceLabel: 'координаты',
    sourceUrl: 'https://welcometoaltai.ru/attractions/gigantskaja_rjab_techenija/',
  },
  {
    id: 'aktru',
    title: 'Актру и ледники',
    category: 'trekking',
    coordinates: {
      lat: 50.083531,
      lng: 87.778774,
    },
    summary: 'Высокогорная долина и альплагерь у ледников Северо-Чуйского хребта. Нужны заброска, теплая одежда и трезвая оценка погоды.',
    price: 'Заброска и гид по запросу',
    duration: 'Целый день или больше',
    sourceLabel: 'Альплагерь Актру',
    sourceUrl: 'https://alpaktru.ru/about/',
  },
  {
    id: 'shavlinskie-lakes',
    title: 'Шавлинские озера',
    category: 'trekking',
    coordinates: {
      lat: 50.102375,
      lng: 87.428368,
    },
    summary: 'Красивый многодневный пеший маршрут от Чибита к озерам Северо-Чуйского хребта. Нужны опыт, снаряжение и запас дней.',
    price: 'Пешком бесплатно; тур или кони по договоренности',
    duration: '3-5 дней',
    sourceLabel: 'маршрут',
    sourceUrl: 'https://travel.altay.ru/mesta/shavlinskie-ozera',
  },
  {
    id: 'mazhoy-cascade',
    title: 'Мажойский каскад',
    category: 'water',
    coordinates: {
      lat: 50.238333,
      lng: 87.593889,
    },
    summary: 'Каньонный участок Чуи с мощными порогами. Для просмотра подходит как точка на маршруте, для сплава нужен опытный гид.',
    price: 'Осмотр бесплатно; сплав только с инструктором',
    duration: '1-2 часа на осмотр',
    sourceLabel: 'координаты',
    sourceUrl: 'https://sib-guide.ru/map/ds/676',
  },
  {
    id: 'chuya-hpp',
    title: 'Недостроенная Чуйская ГЭС',
    category: 'history',
    coordinates: {
      lat: 50.252836,
      lng: 87.662985,
    },
    summary: 'Заброшенный гидроэнергетический объект у Чуи рядом с Акташем. Хорошо совмещается с Мажойским каскадом.',
    price: 'Осмотр бесплатно',
    duration: '30-60 минут',
    sourceLabel: 'описание',
    sourceUrl: 'https://www.vtourisme.com/altaj/istoriya/729-chujskaya-ges',
  },
  {
    id: 'geysir-lake',
    title: 'Гейзерное озеро',
    category: 'nature',
    coordinates: {
      lat: 50.289248,
      lng: 87.667155,
    },
    summary: 'Небольшое голубое озеро у Акташа с оборудованной тропой. Хорошо совмещается с Акташем, ретранслятором и Марсом.',
    price: 'Проход по экотропе около 150 ₽',
    duration: '1-2 часа на месте',
    sourceLabel: 'описание и цены',
    sourceUrl: 'https://snovatrip.ru/geyser-lake-altai/',
  },
  {
    id: 'mountain-spirits-lake',
    title: 'Озеро Горных Духов',
    category: 'trekking',
    coordinates: {
      lat: 50.32462,
      lng: 87.78202,
    },
    summary: 'Высокогорное озеро у Акташского ретранслятора. Нужна заброска, теплая одежда и готовность к резкой смене погоды.',
    price: 'Заброска по договоренности',
    duration: 'Полдня или день',
    sourceLabel: 'описание',
    sourceUrl: 'https://seven.travel/showplaces/ozero-gornykh-dukhov/',
  },
  {
    id: 'kuektanar-lakes',
    title: 'Куектанарские озера',
    category: 'trekking',
    coordinates: {
      lat: 50.188247,
      lng: 88.355364,
    },
    summary: 'Цепочка высокогорных озер в западной части Курайского хребта. Хороший пеший маршрут для подготовленной группы.',
    price: 'Пешком бесплатно; заброска по договоренности',
    duration: 'День или с ночевкой',
    sourceLabel: 'описание',
    sourceUrl: 'https://altai.travel/tourism/places/kuektanarskie_ozera',
  },
  {
    id: 'red-gate',
    title: 'Красные ворота',
    category: 'roadtrip',
    coordinates: {
      lat: 50.364432,
      lng: 87.633396,
    },
    summary: 'Красные скалы прямо на Улаганском тракте. Удобный фотостоп по дороге к озерам, Улагану и Кату-Ярыку.',
    price: 'Фотостоп бесплатно',
    duration: '20-40 минут',
    sourceLabel: 'координаты',
    sourceUrl: 'https://snovatrip.ru/red-gate-altai/',
  },
  {
    id: 'shirlak-waterfall',
    title: 'Водопад Ширлак',
    category: 'water',
    coordinates: {
      lat: 50.345355,
      lng: 87.219958,
    },
    summary: 'Доступный водопад у Чуйского тракта, известный как Девичьи слезы. От парковки до тропы идти всего несколько минут.',
    price: 'Осмотр бесплатно',
    duration: '30-60 минут',
    sourceLabel: 'координаты',
    sourceUrl: 'https://okolo.city/places/vodopad-shirlak',
  },
  {
    id: 'cheybekkel',
    title: 'Чейбеккель, Мертвое озеро',
    category: 'nature',
    coordinates: {
      lat: 50.398431,
      lng: 87.604776,
    },
    summary: 'Вытянутое высокогорное озеро у Улаганского тракта, обычно смотрят вместе с Красными воротами.',
    price: 'Осмотр бесплатно; экскурсии по договоренности',
    duration: '30-60 минут',
    sourceLabel: 'координаты',
    sourceUrl: 'https://snovatrip.ru/lake-cheybekkyol/',
  },
  {
    id: 'aktash-repeater',
    title: 'Акташский ретранслятор',
    category: 'viewpoint',
    coordinates: {
      lat: 50.340016,
      lng: 87.74886,
    },
    summary: 'Высокая смотровая над Акташем: виды на ледники, Курайскую степь и Чуйский тракт. Дорога требует внедорожника.',
    price: 'В источнике 2022: 2-3 тыс. ₽/чел.; актуальную цену уточнять',
    duration: '2-3 часа',
    sourceLabel: 'координаты и цена',
    sourceUrl: 'https://v-pohode.ru/gornyj-altaj/aktashskij-retranslyator.html',
  },
  {
    id: 'pazyryk',
    title: 'Пазырыкские курганы',
    category: 'history',
    coordinates: {
      lat: 50.747556,
      lng: 88.072372,
    },
    summary: 'Археологическое урочище с курганами пазырыкской культуры по дороге к Кату-Ярыку.',
    price: 'Осмотр с дороги бесплатно; экскурсия по договоренности',
    duration: '30-60 минут',
    sourceLabel: 'описание',
    sourceUrl: 'https://vtourisme.com/altaj/bogatstva-altaya/1010-pazyrykskie-kurgany',
  },
  {
    id: 'katu-yaryk',
    title: 'Перевал Кату-Ярык',
    category: 'viewpoint',
    coordinates: {
      lat: 50.912407,
      lng: 88.215571,
    },
    summary: 'Смотровая на серпантин и долину Чулышмана. Дорога длинная, лучше планировать отдельный день.',
    price: 'Смотровая бесплатно; трансфер по договоренности',
    duration: 'День на поездку',
    sourceLabel: 'координаты',
    sourceUrl: 'https://welcometoaltai.ru/attractions/katu-jaryk/',
  },
  {
    id: 'tarkhatinsky-megaliths',
    title: 'Тархатинский мегалитический комплекс',
    category: 'history',
    coordinates: {
      lat: 49.798056,
      lng: 88.495833,
    },
    summary: 'Каменный круг в Чуйской степи, который часто называют Алтайским Стоунхенджем. Дальний выезд, лучше на внедорожнике.',
    price: 'Осмотр бесплатно; гид по договоренности',
    duration: 'Полдня или день',
    sourceLabel: 'координаты',
    sourceUrl: 'https://travel.drom.ru/%D0%9C%D0%B5%D1%81%D1%82%D0%B0/%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/%D0%A0%D0%B5%D1%81%D0%BF%D1%83%D0%B1%D0%BB%D0%B8%D0%BA%D0%B0_%D0%90%D0%BB%D1%82%D0%B0%D0%B9/%D0%9A%D0%BE%D1%88-%D0%90%D0%B3%D0%B0%D1%87/%D0%94%D1%80%D1%83%D0%B3%D0%BE%D0%B5/%D1%82%D0%B0%D1%80%D1%85%D0%B0%D1%82%D0%B8%D0%BD%D1%81%D0%BA%D0%B8%D0%B9_%D0%BC%D0%B5%D0%B3%D0%B0%D0%BB%D0%B8%D1%82%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D0%B9_%D0%BA%D0%BE%D0%BC%D0%BF%D0%BB%D0%B5%D0%BA%D1%81_208499.html',
  },
  {
    id: 'altai-mars',
    title: 'Алтайский Марс, Кызыл-Чин',
    category: 'nature',
    coordinates: {
      lat: 50.093488,
      lng: 88.423985,
    },
    summary: 'Цветные глины и “марсианский” ландшафт за Чаган-Узуном. Нужна машина с хорошей проходимостью и запас воды.',
    price: 'Сбор 300 ₽; местная заброска встречается от 2 000 ₽',
    duration: 'Полдня или день',
    sourceLabel: 'координаты и цены',
    sourceUrl: 'https://media.halvacard.ru/travel/mars-na-altae',
  },
  {
    id: 'kalbak-tash',
    title: 'Петроглифы Калбак-Таш',
    category: 'history',
    coordinates: {
      lat: 50.401735,
      lng: 86.818955,
    },
    summary: 'Один из самых известных археологических комплексов Алтая с древними рисунками на скалах у Чуйского тракта.',
    price: 'Групповые экскурсии встречаются от 350 ₽',
    duration: '1-2 часа',
    sourceLabel: 'координаты и цены',
    sourceUrl: 'https://2gis.ru/gornoaltaysk/firm/70000001051496658/tab/prices',
  },
  {
    id: 'chuya-katun-confluence',
    title: 'Слияние Чуи и Катуни',
    category: 'viewpoint',
    coordinates: {
      lat: 50.394636,
      lng: 86.674362,
    },
    summary: 'Смотровая на место, где воды Чуи и Катуни идут рядом разными цветами. Дальний, но очень сильный видовой маршрут.',
    price: 'Смотровая бесплатно',
    duration: '30-60 минут',
    sourceLabel: 'координаты',
    sourceUrl: 'https://2gis.ru/gornoaltaysk/geo/70030076940480141',
  },
  {
    id: 'aktash-kvadro',
    title: 'Квадро, багги, эндуро',
    category: 'ride',
    coordinates: {
      lat: 50.29829,
      lng: 87.66538,
    },
    summary: 'Маршруты от базы Aktash Kvadro рядом с Акташем: прогулочные поездки, ретранслятор, озеро Горных духов, каскады.',
    price: 'От 5 000 ₽ прогулочный; эндуро от 3 500 ₽/час',
    duration: '1-8 часов',
    sourceLabel: 'Aktash Kvadro',
    sourceUrl: 'https://aktash-kvadro.ru/',
  },
  {
    id: 'chuya-rafting',
    title: 'Рафтинг по Чуе',
    category: 'water',
    coordinates: {
      lat: 50.317,
      lng: 87.55,
    },
    summary: 'Сплавы по Чуе для подготовленных групп. Участки могут быть сложными, формат надо согласовывать отдельно.',
    price: 'Многодневные туры от 59 000 ₽; короткие программы уточнять у организаторов',
    duration: 'От нескольких часов до 5 дней',
    sourceLabel: 'туры по Чуе',
    sourceUrl: 'https://altay.horse/tours/splavy/',
  },
];

const activityLegendItems = (Object.keys(categoryLabels) as NearbyActivityCategory[])
  .map((category) => ({
    category,
    label: categoryLabels[category],
    count: nearbyActivities.filter((activity) => activity.category === category).length,
  }))
  .filter((item) => item.count > 0);

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(left: NearbyActivity['coordinates'], right: NearbyActivity['coordinates']) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(right.lat - left.lat);
  const dLng = toRadians(right.lng - left.lng);
  const lat1 = toRadians(left.lat);
  const lat2 = toRadians(right.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(activity: NearbyActivity) {
  if (activity.id === 'ekoail') {
    return '0 км';
  }

  const distance = getDistanceKm(CAMP_COORDINATES, activity.coordinates);
  return distance < 10 ? `${distance.toFixed(1)} км` : `${Math.round(distance)} км`;
}

function getActivityIcon(activity: NearbyActivity, index: number, isActive: boolean) {
  const color = categoryColors[activity.category];

  return L.divIcon({
    className: `activity-map-marker-shell${isActive ? ' active' : ''}`,
    html: `<span class="activity-map-marker" style="--activity-color:${color}">${index + 1}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getActivityImages(activity: NearbyActivity) {
  return categoryImages[activity.category];
}

function buildActivityPopup(activity: NearbyActivity, index: number) {
  const images = getActivityImages(activity);
  const imageMarkup = images
    .map(
      (url, imageIndex) =>
        `<img src="${url}" alt="${escapeHtml(activity.title)}: фото ${imageIndex + 1}" loading="lazy" />`,
    )
    .join('');

  return `
    <article class="activity-popup">
      <div class="activity-popup-gallery">${imageMarkup}</div>
      <div class="activity-popup-body">
        <span class="activity-popup-kicker">${escapeHtml(categoryLabels[activity.category])} • ${escapeHtml(formatDistance(activity))} от кэмпа</span>
        <strong>${index + 1}. ${escapeHtml(activity.title)}</strong>
        <p>${escapeHtml(activity.summary)}</p>
        <div class="activity-popup-meta">
          <span>${escapeHtml(activity.price)}</span>
          <span>${escapeHtml(activity.duration)}</span>
        </div>
      </div>
    </article>
  `;
}

export function NearbyActivitiesMap() {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const hasHandledInitialMarkerRef = useRef(false);
  const [activeActivityId, setActiveActivityId] = useState('ekoail');

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapElementRef.current, {
      center: [CAMP_COORDINATES.lat, CAMP_COORDINATES.lng],
      zoom: 9,
      scrollWheelZoom: true,
      zoomControl: false,
    });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'topleft' }).addTo(map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">&copy; OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    const bounds = L.latLngBounds([]);
    nearbyActivities.forEach((activity, index) => {
      const marker = L.marker([activity.coordinates.lat, activity.coordinates.lng], {
        icon: getActivityIcon(activity, index, activity.id === activeActivityId),
        riseOnHover: true,
      }).addTo(map);
      marker.bindPopup(buildActivityPopup(activity, index), {
        className: 'activity-popup-shell',
        maxWidth: 320,
        minWidth: 280,
      });
      marker.on('click', () => setActiveActivityId(activity.id));
      markersRef.current[activity.id] = marker;
      bounds.extend([activity.coordinates.lat, activity.coordinates.lng]);
    });

    map.fitBounds(bounds, {
      padding: [42, 42],
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
      hasHandledInitialMarkerRef.current = false;
    };
  }, []);

  useEffect(() => {
    nearbyActivities.forEach((activity, index) => {
      markersRef.current[activity.id]?.setIcon(getActivityIcon(activity, index, activity.id === activeActivityId));
    });

    const marker = markersRef.current[activeActivityId];
    if (!marker || !mapRef.current) {
      return;
    }

    marker.openPopup();
    if (!hasHandledInitialMarkerRef.current) {
      hasHandledInitialMarkerRef.current = true;
      return;
    }

    mapRef.current.flyTo(marker.getLatLng(), activeActivityId === 'ekoail' ? 11 : 9, {
      duration: 0.55,
    });
  }, [activeActivityId]);

  return (
    <section className="activities-section container" id="activities">
      <div className="section-heading">
        <h2>Карта активностей</h2>
      </div>

      <div className="activities-toolbar" aria-label="Типы точек на карте">
        <span>{nearbyActivities.length} точек</span>
        <div className="activities-legend">
          {activityLegendItems.map((item) => (
            <span className={`activity-legend-item activity-${item.category}`} key={item.category}>
              <i aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="activities-layout">
        <div className="activities-map-panel">
          <div className="activities-map" ref={mapElementRef} aria-label="Карта активностей рядом с кэмпом" />
        </div>

        <div className="activities-list" aria-label="Список активностей рядом с кэмпом">
          {nearbyActivities.map((activity, index) => (
            <article className={`activity-card activity-${activity.category}${activity.id === activeActivityId ? ' active' : ''}`} key={activity.id}>
              <button
                className="activity-card-trigger"
                type="button"
                aria-pressed={activity.id === activeActivityId}
                onClick={() => setActiveActivityId(activity.id)}
              >
                <span className="activity-card-head">
                  <span className="activity-card-number">{index + 1}</span>
                  <span className="activity-card-title">
                    <span className="activity-card-kicker">{categoryLabels[activity.category]} • {formatDistance(activity)}</span>
                    <strong>{activity.title}</strong>
                  </span>
                </span>
                <span className="activity-card-summary">{activity.summary}</span>
                <span className="activity-meta-row">
                  <span>{activity.price}</span>
                  <span>{activity.duration}</span>
                </span>
              </button>
              <a className="activity-source-link" href={activity.sourceUrl} target="_blank" rel="noreferrer">
                {activity.sourceLabel}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
