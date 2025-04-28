export type HexColorString = string;

export type UnmatchedCardType = 'attack' | 'defense' | 'versatile' | 'scheme';

export type CardConstantsType = {
  height: number;
  width: number;
  bottomPanelPadding: number;
  outerBorderWidth: number;
  innerCornerRadius: number;
  cornerRadius: number;
  hRuleThickness: number;
  outerBorderColour: HexColorString;
  boostCircleRadius: number;
};

export type DeckImportCardType = {
  id?: string;
  title: string;
  characterName: string;
  type: UnmatchedCardType;
  value: number;
  basicText?: string;
  immediateText?: string;
  duringText?: string;
  afterText?: string;
  boost?: number;
  quantity: number;
  imageUrl?: string;
};
