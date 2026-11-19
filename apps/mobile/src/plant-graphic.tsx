import { useEffect } from 'react';
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
        if (size) onSize?.(size);
      })
      .catch(() => {
        if (!cancelled) onError?.();
      });
    return () => {
      cancelled = true;
    };
  }, [onError, onSize, svg, uri]);

  if (svg) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <SvgUri
          uri={uri}
          width="100%"
          height="100%"
          onError={() => onError?.()}
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={StyleSheet.absoluteFill}
      resizeMode="contain"
      onError={() => onError?.()}
      onLoad={(event) => {
        const source = event.nativeEvent.source;
        onSize?.({ width: source.width, height: source.height });
      }}
    />
  );
}
