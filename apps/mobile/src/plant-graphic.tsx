import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { SvgUri } from 'react-native-svg';
import { isSvgAsset, svgViewSize } from './plant-image';

type Size = { width: number; height: number };

/** Raster pictures use Image. SVG uses the SVG renderer. PDF page 1 is the PNG the API stored. */
export function PlantImage({
  uri,
  onSize,
  onError,
}: {
  uri: string;
  onSize?: (size: Size) => void;
  onError?: () => void;
}) {
  const svg = isSvgAsset(uri);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const onSizeRef = useRef(onSize);
  const onErrorRef = useRef(onError);
  onSizeRef.current = onSize;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!svg) return;
    let cancelled = false;
    void fetch(uri)
      .then((res) => {
        if (!res.ok) throw new Error('svg');
        return res.text();
      })
      .then((xml) => {
        if (cancelled) return;
        const size = svgViewSize(xml);
        if (size) onSizeRef.current?.(size);
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current?.();
      });
    return () => {
      cancelled = true;
    };
  }, [svg, uri]);

  if (svg) {
    return (
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setBox((prev) =>
            Math.abs(prev.width - width) < 1 &&
            Math.abs(prev.height - height) < 1
              ? prev
              : { width, height },
          );
        }}
      >
        {box.width > 0 && box.height > 0 ? (
          <SvgUri
            uri={uri}
            width={box.width}
            height={box.height}
            onError={() => onErrorRef.current?.()}
          />
        ) : null}
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={StyleSheet.absoluteFill}
      resizeMode="contain"
      onError={() => onErrorRef.current?.()}
      onLoad={(event) => {
        const source = event.nativeEvent.source;
        onSizeRef.current?.({ width: source.width, height: source.height });
      }}
    />
  );
}
