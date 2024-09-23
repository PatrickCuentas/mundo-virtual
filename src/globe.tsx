import { pointer, select, Selection } from "d3-selection";
import {
  geoOrthographic,
  geoPath,
  GeoProjection,
  GeoSphere,
  GeoPermissibleObjects
} from "d3-geo";
import { D3DragEvent, drag } from "d3-drag";
import { D3ZoomEvent, zoom } from "d3-zoom";
import { json } from "d3-fetch";
import {
  GeometryCollection,
  GeometryObject,
  MultiPolygon,
  Polygon,
  Topology
} from "topojson-specification";

import * as topojson from "topojson";
import { useEffect, useRef, FC, useCallback, useLayoutEffect } from "react";
import { createStyles, makeStyles, Theme } from "@material-ui/core";

import * as GeoJSON from "geojson";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      height: "100%",
      width: "100%"
    },
    globe: {
      backgroundColor: theme.palette.background.default
    },
    ocean: {
      fill: theme.palette.background.paper
    },
    land: { fill: theme.palette.grey[500] },
    boundary: {
      fill: "none",
      stroke: "#ccc",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      "vector-effect": "non-scaling-stroke"
    }
  })
);

export interface PolygonWithColor extends GeoJSON.Polygon {
  color: string;
}

export const Globe: FC<{
  onMouseMove?: (lon: number, lat: number) => void;
  onDblClick?: (lon: number, lat: number) => void;
  centerLat?: number;
  centerLng?: number;
  geoJsonPolygons?: PolygonWithColor[];
  globeId: string;
  scaleFactor?: number;
}> = ({
  onMouseMove,
  onDblClick,
  centerLat,
  centerLng,
  geoJsonPolygons,
  globeId,
  scaleFactor
}) => {
  const classes = useStyles();

  const projection = useRef<GeoProjection>(geoOrthographic());
  const geoPathGenerator = useRef(
    geoPath<SVGPathElement, GeoPermissibleObjects>().projection(
      projection.current
    )
  );
  const map = useRef<Selection<SVGSVGElement, unknown, HTMLElement, unknown>>();
  const initialScaleRef = useRef<number>(1);
  const currentScaleRef = useRef<number>(1);

  // set the map container on component mount
  useLayoutEffect(() => {
    map.current = select(`#${globeId}_map`);
  }, [globeId]);

  // update globe view using current paths and projection
  const repaint = useCallback(() => {
    if (projection.current && geoPathGenerator.current) {
      geoPathGenerator.current.projection(projection.current);
      map.current
        ?.selectAll<SVGPathElement, GeoJSON.Polygon>("path")
        .attr("d", geoPathGenerator.current);
    }
  }, []);

  // handle the D3 event when the mouse moves
  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const lon_lat = projection.current?.invert?.(pointer(event, this));
      if (lon_lat && onMouseMove) {
        onMouseMove(lon_lat[0], lon_lat[1]);
      }
    },
    [onMouseMove]
  );

  // pass lat/lng up when a dbl click occurs
  const handleDblClick = useCallback(
    (event: MouseEvent) => {
      const lon_lat = projection.current?.invert?.(pointer(event, this));
      if (lon_lat && onDblClick) {
        onDblClick(lon_lat[0], lon_lat[1]);
      }
    },
    [onDblClick]
  );

  // center the D3 globe by manipulating D3 state
  const center = useCallback(
    (lon_lat: [number, number] | undefined | null) => {
      const lon = lon_lat?.[0] ?? 0;
      const lat = lon_lat?.[1] ?? 0;

      projection.current?.rotate([-lon, -lat]);
      repaint();
    },
    [repaint]
  );

  // center the globe when the incoming props change to allow outside to control when to center by changing these values
  useEffect(() => {
    if (centerLat && centerLng) {
      center([centerLng, centerLat]);
    }
  }, [center, centerLng, centerLat]);

  // handle dragging the globe to rotate by manipulating internal D3 state
  const dragged = useCallback(
    (event: D3DragEvent<SVGSVGElement, undefined, HTMLElement>) => {
      if (projection.current) {
        const sensitivity = 75;
        const rotate = projection.current.rotate();
        const k = sensitivity / projection.current.scale();
        projection.current.rotate([
          rotate[0] + event.dx * k,
          rotate[1] - event.dy * k
        ]);
        repaint();
      }
    },
    [repaint]
  );

  // handle zooming the globe by manipulating internal D3 state
  const zoomed = useCallback(
    (event: D3ZoomEvent<SVGElement, unknown>) => {
      if (projection.current) {
        currentScaleRef.current = initialScaleRef.current * event.transform.k;
        projection.current.scale(currentScaleRef.current);
        repaint();
      }
    },
    [repaint]
  );

  // load the GeoJSON into the map object
  const loadGeoJson = useCallback(() => {
    if (
      map.current &&
      projection.current! &&
      geoJsonPolygons &&
      geoPathGenerator.current
    ) {
      console.log("adding polylgons");
      const routeElements = geoJsonPolygons.map((route, index) => {
        return map.current
          ?.append<SVGPathElement>("path")
          ?.datum(route)
          ?.attr("class", `${globeId}_route_${index}`)
          ?.attr("d", geoPathGenerator.current)
          ?.style("fill", "none")
          ?.style("stroke", route.color)
          ?.style("stroke-width", 3);
      });

      repaint();

      return () => {
        console.log("remove polygons");
        routeElements.forEach((route) => route?.remove());
      };
    }
  }, [geoJsonPolygons, globeId, repaint]);

  // update/load geojson whenever a props change occurs
  useLayoutEffect(() => {
    return loadGeoJson();
  }, [loadGeoJson, geoJsonPolygons]);

  // load the paths to be rendered into their path containers
  const loadPaths = useCallback(
    (
      globeJson: Topology<{
        countries: GeometryCollection<Polygon | MultiPolygon>;
        land: GeometryCollection<MultiPolygon>;
      }>
    ) => {
      if (geoPathGenerator.current && globeJson) {
        select<SVGPathElement, GeoSphere>(`#${globeId}_oceanPath`)
          .datum({ type: "Sphere" } as GeoSphere)
          .attr("d", geoPathGenerator.current);

        const landPath = topojson.merge(
          globeJson,
          (globeJson.objects.land as GeometryCollection<MultiPolygon>)
            .geometries as MultiPolygon[]
        );

        select<SVGPathElement, GeoJSON.MultiPolygon>(`#${globeId}_landPath`)
          .datum(landPath)
          .attr("d", geoPathGenerator.current);

        const countryPath = topojson.mesh(
          globeJson,
          globeJson.objects.countries as GeometryObject,
          function (a, b) {
            return a !== b;
          }
        );

        select<SVGPathElement, GeoJSON.MultiLineString>(
          `#${globeId}_boundaryPath`
        )
          .datum(countryPath)
          .attr("d", geoPathGenerator.current);
      }
    },
    [globeId]
  );

  // handle when window resizes, update scale and translate
  const handleResize = useCallback(() => {
    if (projection.current) {
      const globeDiv = select(`#${globeId}_globe`).node() as HTMLDivElement;
      const width = globeDiv?.clientWidth ?? 180;
      const height = globeDiv?.clientHeight ?? 180;
      projection.current = projection.current.translate([
        width / 2,
        height / 2
      ]);

      const currentScaleFactor =
        currentScaleRef.current / initialScaleRef.current;
      const newInitialScale = Math.min(width, height) / 2.0;
      const newCurrentScaleFactor = newInitialScale * currentScaleFactor;
      currentScaleRef.current = newCurrentScaleFactor;
      initialScaleRef.current = newInitialScale;
      projection.current = projection.current.scale(currentScaleRef.current);

      repaint();
    }
  }, [globeId, repaint]);

  // add window event listener to determine if we need to resize
  useEffect(() => {
    let debounceActive = false;
    const debounceResize = () => {
      if (!debounceActive) {
        debounceActive = true;
        setTimeout(() => {
          handleResize();
          debounceActive = false;
        }, 100);
      }
    };

    window.addEventListener("resize", debounceResize);
    return () => {
      window.removeEventListener("resize", debounceResize);
    };
  }, [handleResize]);

  // initial setup - d3 events and fetch map data
  useEffect(() => {
    if (projection.current! && geoPathGenerator.current!) {
      const svg = select<SVGSVGElement, unknown>(`#${globeId}_svg`);
      svg
        .on("mousemove", handleMouseMove)
        .on("click", null)
        .on("dblclick", handleDblClick);

      // enable drag
      const _drag = drag<SVGSVGElement, unknown>().on("drag", dragged);
      svg.call(_drag);

      // enable zoom
      const _zoom = zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.75, 8]) //bound zoom
        .on("zoom", zoomed);
      svg.call(_zoom);
      svg.on("dblclick.zoom", null);

      // load topojson https://github.com/topojson/world-atlas
      json<unknown>(
        "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
      ).then((j) => {
        if (!j) {
          return console.error(`Unable to load country data`);
        }

        // casting this without verifying could be dangerous if we don't trust the source data
        const globeJson = j as Topology<{
          countries: GeometryCollection<Polygon | MultiPolygon>;
          land: GeometryCollection<MultiPolygon>;
        }>;

        handleResize();
        loadPaths(globeJson);
      });
    }

    // these are all useCallbacks so should not trigger this run more than once
  }, [
    dragged,
    globeId,
    handleDblClick,
    handleMouseMove,
    loadGeoJson,
    loadPaths,
    handleResize,
    scaleFactor,
    zoomed
  ]);

  return (
    <>
      <div id={`${globeId}_globe`} className={classes.root}>
        <svg
          id={`${globeId}_svg`}
          className={classes.globe}
          height="100%"
          width="100%"
        >
          <g id={`${globeId}_map`}>
            <path id={`${globeId}_oceanPath`} className={classes.ocean} />
            <path id={`${globeId}_landPath`} className={classes.land} />
            <path id={`${globeId}_boundaryPath`} className={classes.boundary} />
          </g>
        </svg>
      </div>
    </>
  );
};
