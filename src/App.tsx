import "./styles.css";
import { Globe, PolygonWithColor } from "./globe";

export default function App() {
  const geojson = JSON.parse(`
      {
        "type": "Feature",
        "properties": {},
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [
                -8.6572265625,
                -1.8893059628373186
              ],
              [
                7.9541015625,
                -1.8893059628373186
              ],
              [
                7.9541015625,
                8.928487062665504
              ],
              [
                -8.6572265625,
                8.928487062665504
              ],
              [
                -8.6572265625,
                -1.8893059628373186
              ]
            ]
          ]
        }
      }
    `) as PolygonWithColor;
  geojson.color = "green";

  return (
    <div className="app">
      <div className="wrapper">
        <Globe globeId="app" geoJsonPolygons={[geojson]} />
      </div>
    </div>
  );
}
