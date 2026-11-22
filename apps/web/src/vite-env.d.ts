/// <reference types="vite/client" />

declare module '*.svg?raw' {
  const content: string;
  export default content;
}

declare module '@phosphor-icons/react' {
  import type { ComponentType, SVGProps } from 'react';
  export interface IconProps extends SVGProps<SVGSVGElement> {
    size?: string | number;
    weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
    color?: string;
    mirrored?: boolean;
    alt?: string;
  }
  export type Icon = ComponentType<IconProps>;
}
