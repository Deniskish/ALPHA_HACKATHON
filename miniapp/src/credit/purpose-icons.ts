// Alfa glyphs for financing purposes (used in tags and product cards).
import { ArrowsCwMIcon } from '@alfalab/icons-glyph/ArrowsCwMIcon';
import { ToolsMIcon } from '@alfalab/icons-glyph/ToolsMIcon';
import { ShopMIcon } from '@alfalab/icons-glyph/ShopMIcon';
import { ChartLineAscMIcon } from '@alfalab/icons-glyph/ChartLineAscMIcon';
import { ChartPieCoinsMIcon } from '@alfalab/icons-glyph/ChartPieCoinsMIcon';
import { ArrowsRightLeftCurvedMIcon } from '@alfalab/icons-glyph/ArrowsRightLeftCurvedMIcon';
import { RocketMIcon } from '@alfalab/icons-glyph/RocketMIcon';
import { BriefcaseMIcon } from '@alfalab/icons-glyph/BriefcaseMIcon';
import type { GlyphIcon } from './ui';
import type { CreditPurpose } from '../../api-server/credit/types';

export const WorkingCapitalIcon = ArrowsCwMIcon;
export const purposeIcons: Record<CreditPurpose, GlyphIcon> = {
  WORKING_CAPITAL: ArrowsCwMIcon, EQUIPMENT: ToolsMIcon, NEW_LOCATION: ShopMIcon, EXPANSION: ChartLineAscMIcon,
  INVESTMENT_PROJECT: ChartPieCoinsMIcon, REFINANCING: ArrowsRightLeftCurvedMIcon, YOUNG_BUSINESS: RocketMIcon, OTHER: BriefcaseMIcon,
};
