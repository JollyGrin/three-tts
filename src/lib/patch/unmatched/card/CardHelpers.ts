import type { CardConstantsType, DeckImportCardType, UnmatchedCardType } from './CardTypes';

// Card constants with static measurements
export const cardConstants: CardConstantsType = {
  height: 88,
  width: 63,
  bottomPanelPadding: 3,
  outerBorderWidth: 3,
  innerCornerRadius: 1.5,
  cornerRadius: 2.5,
  hRuleThickness: 0.8,
  outerBorderColour: '#f7eadb',
  boostCircleRadius: 3.75
};

// Style definitions for card elements
export const cardStyles = {
  topPanelStyle: { fill: '#fff' },
  bottomPanelStyle: { fill: '#000' },
  characterNameStyle: {
    fill: '#fff',
    fontFamily: 'BebasNeueRegular, sans-serif',
    fontSize: '4px'
  },
  titleTextStyle: {
    fill: '#fff',
    fontFamily: 'BebasNeueRegular, sans-serif',
    fontSize: '5px'
  },
  sectionHeadingStyle: {
    fill: '#fff',
    fontFamily: 'BebasNeueRegular, sans-serif',
    fontSize: '4px'
  },
  boostValueStyle: {
    fill: '#fff',
    fontFamily: 'BebasNeueRegular, sans-serif',
    fontSize: '5px'
  },
  bottomCornerStyle: {
    fill: '#fff',
    fontFamily: 'BebasNeueRegular, sans-serif',
    fontSize: '1.8px'
  },
  quantityStyle: {
    fill: '#fff',
    fontFamily: 'LeagueGothic, sans-serif',
    fontSize: '1.8px'
  },
  cardValueStyle: {
    fill: '#fff',
    fontFamily: 'BebasNeueRegular, sans-serif',
    fontSize: '4px'
  }
};

// Helper functions
export const isScheme = (type: UnmatchedCardType): boolean => {
  return type === 'scheme';
};

export const roundNumber = (number: number, roundTo: number): number => {
  return Number(number.toFixed(roundTo));
};

export const imageUri = (imageUrl: string | undefined): string => {
  return imageUrl ?? 'https://picsum.photos/300';
};

// Text wrapping function - simplified for static dimensions
export const wrapText = (text: string | undefined, maxChars: number): string[] => {
  if (!text || !text.trim()) return [];

  const lines: string[] = [];
  const paragraphs = text.trim().split(/\r?\n/);

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (testLine.length <= maxChars) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
};

// Calculate all properties needed for card rendering
export const calculateCardProps = (card: DeckImportCardType) => {
  const innerWidth = cardConstants.width - 2 * cardConstants.outerBorderWidth;
  const maxTextWidth = innerWidth - 2 * cardConstants.bottomPanelPadding;

  // Text wrapping with static character limits
  const wrapCardTitle = wrapText(card.title, 18);
  const wrapBasicText = wrapText(card.basicText, 28);
  const wrapImmediateText = wrapText(card.immediateText, 24);
  const wrapDuringText = wrapText(card.duringText, 24);
  const wrapAfterText = wrapText(card.afterText, 24);

  // Calculate panel heights
  const textContentHeight =
    6 * wrapCardTitle.length +
    3.3 *
    1.1 *
    (wrapBasicText.length +
      wrapImmediateText.length +
      wrapDuringText.length +
      wrapAfterText.length) +
    5;

  const bottomPanelHeight = Math.max(28.8, textContentHeight);
  const topPanelHeight =
    cardConstants.height -
    2 * cardConstants.outerBorderWidth -
    bottomPanelHeight -
    cardConstants.hRuleThickness;
  const bottomPanelY = topPanelHeight + cardConstants.hRuleThickness;

  return {
    isScheme: isScheme(card.type),
    innerWidth,
    topPanelWidth: innerWidth,
    topPanelHeight,
    bottomPanelWidth: innerWidth,
    bottomPanelHeight,
    bottomPanelY,
    dataUri: imageUri(card.imageUrl),
    wrapCardTitle,
    wrapBasicText,
    wrapImmediateText,
    wrapDuringText,
    wrapAfterText,
    maxTextWidth
  };
};

// Card type color mapping
export const cardTypeColors = {
  attack: '#ce3b39', // Red
  defense: '#4c9df8', // Blue
  versatile: '#7b58c2', // Purple
  scheme: '#FFDE21' // Green
};
