export interface Algorithm {
  id: string;
  title: string;
  description: string;
  author: string;
  tags: string[];
  isPaid: boolean;
  price?: number;
  code?: string;
  /** С сервера: виден ли код текущему пользователю */
  codeVisible?: boolean;
  language: string;
  compiler: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: 'author' | 'consumer' | 'moderator';
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface LoginData {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export interface ModeratedAlgorithm extends Algorithm {
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  moderated_by?: string;
  moderated_at?: string;
  author_name: string;
}

export interface ModerationRequest {
  status: 'approved' | 'rejected';
  rejection_reason?: string;
}

export interface AlgorithmPurchaseItem {
  id: number;
  purchasedAt: string;
  /** Цена на момент покупки, ₽ */
  purchasePrice: number;
  algorithm: ModeratedAlgorithm;
}

export interface PriceHistoryPoint {
  recordedAt: string;
  price: number;
}