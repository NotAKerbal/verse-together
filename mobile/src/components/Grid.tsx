// .browse-grid: one column on phones, two from 640pt, three from 1024pt (tablets).

import { Children, type ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";

export function useGridColumns(): number {
  const { width } = useWindowDimensions();
  return width >= 1024 ? 3 : width >= 640 ? 2 : 1;
}

export default function Grid({ children, gap = 14.4 }: { children: ReactNode; gap?: number }) {
  const columns = useGridColumns();
  const items = Children.toArray(children).filter(Boolean);
  if (columns === 1) return <View style={{ gap }}>{items}</View>;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
      {items.map((item, index) => {
        // A last card alone on its row takes the whole row (.browse-library > li:last-child:nth-child(odd)).
        const alone = index === items.length - 1 && items.length % columns === 1;
        return (
          <View key={index} style={{ width: alone ? "100%" : `${(100 - (columns - 1) * 2) / columns}%`, flexGrow: alone ? 0 : 1 }}>
            {item}
          </View>
        );
      })}
    </View>
  );
}
