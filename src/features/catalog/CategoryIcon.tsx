import { BrickWall, Droplets, Flame, Hammer, HardHat, House, PaintRoller, Snowflake, Sparkles, Trees, Wrench, Zap, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  droplets: Droplets, zap: Zap, hammer: Hammer, snowflake: Snowflake, 'paint-roller': PaintRoller, wrench: Wrench,
  sparkles: Sparkles, 'hard-hat': HardHat, flame: Flame, 'brick-wall': BrickWall, trees: Trees, house: House,
};

export function CategoryIcon({ name, className = 'size-5' }: { name: string | null | undefined; className?: string }) {
  const Icon = (name && ICONS[name]) || Wrench;
  return <Icon className={className} aria-hidden="true" />;
}
