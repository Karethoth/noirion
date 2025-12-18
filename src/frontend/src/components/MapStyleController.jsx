import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

export default function MapStyleController({ style }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    container.classList.remove('map-style-day', 'map-style-night', 'map-style-satellite');
    if (style && style !== 'day') {
      container.classList.add(`map-style-${style}`);
    }
  }, [style, map]);

  return null;
}
