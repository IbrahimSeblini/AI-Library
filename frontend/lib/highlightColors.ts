export type HighlightColor =
  | 'yellow'
  | 'green'
  | 'blue'
  | 'pink'
  | 'orange'
  | 'purple'
  | 'teal'
  | 'red'
  | 'cyan'
  | 'lime';

export const HIGHLIGHT_COLOR_ORDER: HighlightColor[] = [
  'yellow',
  'green',
  'blue',
  'pink',
  'orange',
  'purple',
  'teal',
  'red',
  'cyan',
  'lime',
];

export const HIGHLIGHT_COLOR_CONFIG: Record<
  HighlightColor,
  {
    name: string;
    swatch: string;
    text: string;
    border: string;
    dot: string;
    ring: string;
  }
> = {
  yellow: {
    name: 'Yellow',
    swatch: 'bg-yellow-300',
    text: 'bg-yellow-300 text-yellow-900',
    border: 'border-yellow-400',
    dot: 'bg-yellow-400',
    ring: 'ring-yellow-500',
  },
  green: {
    name: 'Green',
    swatch: 'bg-green-300',
    text: 'bg-green-300 text-green-900',
    border: 'border-green-400',
    dot: 'bg-green-400',
    ring: 'ring-green-500',
  },
  blue: {
    name: 'Blue',
    swatch: 'bg-blue-300',
    text: 'bg-blue-300 text-blue-900',
    border: 'border-blue-400',
    dot: 'bg-blue-400',
    ring: 'ring-blue-500',
  },
  pink: {
    name: 'Pink',
    swatch: 'bg-pink-300',
    text: 'bg-pink-300 text-pink-900',
    border: 'border-pink-400',
    dot: 'bg-pink-400',
    ring: 'ring-pink-500',
  },
  orange: {
    name: 'Orange',
    swatch: 'bg-orange-300',
    text: 'bg-orange-300 text-orange-900',
    border: 'border-orange-400',
    dot: 'bg-orange-400',
    ring: 'ring-orange-500',
  },
  purple: {
    name: 'Purple',
    swatch: 'bg-purple-300',
    text: 'bg-purple-300 text-purple-950',
    border: 'border-purple-400',
    dot: 'bg-purple-400',
    ring: 'ring-purple-500',
  },
  teal: {
    name: 'Teal',
    swatch: 'bg-teal-300',
    text: 'bg-teal-300 text-teal-950',
    border: 'border-teal-400',
    dot: 'bg-teal-400',
    ring: 'ring-teal-500',
  },
  red: {
    name: 'Red',
    swatch: 'bg-rose-300',
    text: 'bg-rose-300 text-rose-950',
    border: 'border-rose-400',
    dot: 'bg-rose-400',
    ring: 'ring-rose-500',
  },
  cyan: {
    name: 'Cyan',
    swatch: 'bg-cyan-300',
    text: 'bg-cyan-300 text-cyan-950',
    border: 'border-cyan-400',
    dot: 'bg-cyan-400',
    ring: 'ring-cyan-500',
  },
  lime: {
    name: 'Lime',
    swatch: 'bg-lime-300',
    text: 'bg-lime-300 text-lime-950',
    border: 'border-lime-400',
    dot: 'bg-lime-400',
    ring: 'ring-lime-500',
  },
};
