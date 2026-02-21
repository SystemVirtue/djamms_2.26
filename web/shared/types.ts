/**
 * Branding configuration stored in player_settings.branding JSONB.
 * All three apps consume this from Realtime — never hardcode the name or logo.
 */
export interface BrandingConfig {
  /** Display name of the jukebox (e.g. "Obie Jukebox") */
  name: string;
  /** URL or path to the logo image */
  logo: string;
  /** UI theme: "dark" | "light" */
  theme: string;
}

export interface SearchResult {
  id: string;
  title: string;
  artist?: string;
  channelTitle?: string;
  thumbnail: string;
  thumbnailUrl?: string;
  url: string;
  videoUrl?: string;
  duration?: number;
  officialScore?: number;
}

export interface SearchInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchResults: SearchResult[];
  isSearching: boolean;
  showKeyboard: boolean;
  showSearchResults: boolean;
  onKeyboardInput: (key: string) => void;
  onVideoSelect: (video: SearchResult) => void;
  onBackToSearch: () => void;
  mode?: "FREEPLAY" | "PAID";
  credits?: number;
  onInsufficientCredits?: () => void;
  includeKaraoke?: boolean;
  onIncludeKaraokeChange?: (checked: boolean) => void;
  bypassCreditCheck?: boolean;
}