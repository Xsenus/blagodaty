import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type NearbyActivityCategory = 'base' | 'viewpoint' | 'trekking' | 'water' | 'ride' | 'nature';

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
};

const categoryColors: Record<NearbyActivityCategory, string> = {
  base: '#285f4c',
  viewpoint: '#b7653f',
  trekking: '#476d99',
  water: '#347e99',
  ride: '#8c6b2f',
  nature: '#4c7d45',
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

export function NearbyActivitiesMap() {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.CircleMarker>>({});
  const [activeActivityId, setActiveActivityId] = useState('ekoail');
  const activeActivity = useMemo(
    () => nearbyActivities.find((activity) => activity.id === activeActivityId) ?? nearbyActivities[0],
    [activeActivityId],
  );

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapElementRef.current, {
      center: [CAMP_COORDINATES.lat, CAMP_COORDINATES.lng],
      zoom: 9,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);

    const bounds = L.latLngBounds([]);
    nearbyActivities.forEach((activity) => {
      const color = categoryColors[activity.category];
      const marker = L.circleMarker([activity.coordinates.lat, activity.coordinates.lng], {
        radius: activity.id === 'ekoail' ? 9 : 7,
        color,
        fillColor: color,
        fillOpacity: 0.88,
        weight: 3,
      }).addTo(map);
      marker.bindPopup(`<strong>${activity.title}</strong><br>${activity.price}`);
      marker.on('click', () => setActiveActivityId(activity.id));
      markersRef.current[activity.id] = marker;
      bounds.extend([activity.coordinates.lat, activity.coordinates.lng]);
    });

    map.fitBounds(bounds, {
      padding: [34, 34],
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const marker = markersRef.current[activeActivityId];
    if (!marker || !mapRef.current) {
      return;
    }

    marker.openPopup();
    mapRef.current.flyTo(marker.getLatLng(), activeActivityId === 'ekoail' ? 11 : 10, {
      duration: 0.55,
    });
  }, [activeActivityId]);

  return (
    <section className="activities-section container" id="activities">
      <div className="section-heading">
        <p className="section-kicker">Рядом с кэмпом</p>
        <h2>Карта активностей</h2>
        <p>Ориентиры собраны вокруг точки Экоаила в Курае. Цены лучше проверять перед поездкой: сезон, группа и транспорт сильно влияют на итог.</p>
      </div>

      <div className="activities-layout">
        <div className="activities-map-panel">
          <div className="activities-map" ref={mapElementRef} aria-label="Карта активностей рядом с кэмпом" />
          <div className="activities-map-note">
            <strong>{activeActivity.title}</strong>
            <span>{categoryLabels[activeActivity.category]} • {formatDistance(activeActivity)} от кэмпа</span>
          </div>
        </div>

        <div className="activities-list" aria-label="Список активностей рядом с кэмпом">
          {nearbyActivities.map((activity) => (
            <article className={`activity-card${activity.id === activeActivityId ? ' active' : ''}`} key={activity.id}>
              <button
                className="activity-card-trigger"
                type="button"
                aria-pressed={activity.id === activeActivityId}
                onClick={() => setActiveActivityId(activity.id)}
              >
                <span className="activity-card-kicker">{categoryLabels[activity.category]} • {formatDistance(activity)}</span>
                <strong>{activity.title}</strong>
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
