import { Algorithm, User, AuthResponse, LoginData, RegisterData, ModeratedAlgorithm, ModerationRequest, AlgorithmPurchaseItem, PriceHistoryPoint } from '../types';

const API_BASE_URL = 'http://localhost:8000/api';

export interface ApiAlgorithm {
  id: number;
  name: string;
  description: string;
  author_name: string;
  tegs: string;
  status: string;
  is_paid: boolean;
  price?: number;
  code?: string;
  language: string;
  compiler: string;
  created_at: string;
  updated_at: string;
  rejection_reason?: string;
  moderated_by?: string;
  moderated_at?: string;
  code_visible?: boolean;
}

class ApiService {
  constructor() {
    // Привязываем контекст методов
    this.transformAlgorithm = this.transformAlgorithm.bind(this);
    this.transformModeratedAlgorithm = this.transformModeratedAlgorithm.bind(this);
  }

  private formatApiError(data: unknown, status: number): string {
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if ('detail' in obj && obj.detail !== undefined) {
        const d = obj.detail;
        if (typeof d === 'string') return d;
        if (Array.isArray(d)) return d.map(String).join(', ');
      }
      const parts: string[] = [];
      for (const [key, val] of Object.entries(obj)) {
        if (key === 'detail') continue;
        if (Array.isArray(val)) {
          val.forEach((m) => parts.push(`${key}: ${m}`));
        } else if (val != null) {
          parts.push(`${key}: ${val}`);
        }
      }
      if (parts.length) return parts.join('; ');
    }
    return `HTTP error ${status}`;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = localStorage.getItem('accessToken');
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        headers,
        ...options,
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        }

        const errorData = await response.json().catch(() => null);
        throw new Error(this.formatApiError(errorData, response.status));
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Аутентификация
  async login(loginData: LoginData): Promise<{ access: string; refresh: string }> {
    const response = await fetch(`${API_BASE_URL}/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(loginData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Login failed');
    }

    return await response.json();
  }

  async register(registerData: RegisterData & { password2: string }): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/users/register/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(registerData),
    });

    if (!response.ok) {
      let errorMessage = 'Registration failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
        
        // Обработка ошибок валидации как в рабочем коде
        if (typeof errorData === 'object') {
          const errorMessages: string[] = [];
          Object.entries(errorData).forEach(([field, messages]) => {
            if (Array.isArray(messages)) {
              (messages as string[]).forEach(msg => errorMessages.push(`${field}: ${msg}`));
            } else {
              errorMessages.push(`${field}: ${messages}`);
            }
          });
          errorMessage = errorMessages.join(', ');
        }
      } catch (e) {
        // Если не удалось распарсить JSON, используем текст ответа
        errorMessage = await response.text();
      }
      throw new Error(errorMessage);
    }

    // Регистрация успешна, но не возвращаем данные пользователя
    return;
  }

  async getCurrentUser(): Promise<User> {
    const userData = await this.request<any>('/users/me/');
    
    // Отладочная информация
    console.log('Raw user data from API:', userData);
    
    // Определяем роль пользователя
    let userRole: User['role'] = 'consumer';
    
    // 1. Проверяем стандартное поле role
    if (userData.role && (userData.role === 'moderator' || userData.role === 'admin')) {
      userRole = userData.role;
    }
    // 2. Проверяем Django-specific поля
    else if (userData.is_staff || userData.is_superuser) {
      userRole = 'moderator';
    }
    // 3. Проверяем группы пользователя
    else if (userData.groups && Array.isArray(userData.groups)) {
      const groupNames = userData.groups.map((group: any) => 
        typeof group === 'string' ? group.toLowerCase() : 
        (group.name ? group.name.toLowerCase() : '')
      );
      
      const moderatorGroups = [
        'moderator', 'moderators', 'модератор', 'модераторы',
        'admin', 'administrators', 'администратор', 'администраторы'
      ];
      
      if (groupNames.some((group: string) => moderatorGroups.includes(group))) {
        userRole = 'moderator';
      }
    }
    // 4. Временная заглушка для тестирования
    else if (['admin', 'moderator', 'testmod', 'administrator'].includes(userData.username?.toLowerCase())) {
      userRole = 'moderator';
    }
    
    console.log('Determined user role:', userRole);
    
    return {
      id: userData.id?.toString() || '',
      username: userData.username || '',
      email: userData.email || '',
      first_name: userData.first_name || '',
      last_name: userData.last_name || '',
      role: userRole,
      // Сохраняем все данные пользователя для дополнительных проверок
      ...userData
    };
  }

  async getUserAlgorithms(username: string): Promise<ModeratedAlgorithm[]> {
    const response = await this.request<any>(`/users/${username}/algorithms/`);
    
    // Обрабатываем разные форматы ответа
    let algorithmsArray: any[] = [];
    
    if (Array.isArray(response)) {
      algorithmsArray = response;
    } else if (response.results && Array.isArray(response.results)) {
      algorithmsArray = response.results;
    } else {
      algorithmsArray = Object.values(response);
    }
    
    return algorithmsArray.map(this.transformModeratedAlgorithm);
  }

  async updateUser(userData: Partial<User>): Promise<User> {
    const payload = {
      username: userData.username,
      email: userData.email,
      first_name: userData.first_name ?? '',
      last_name: userData.last_name ?? '',
    };
    const updatedUser = await this.request<any>('/users/me/', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    
    return {
      id: updatedUser.id?.toString() || '',
      username: updatedUser.username || '',
      email: updatedUser.email || '',
      first_name: updatedUser.first_name || '',
      last_name: updatedUser.last_name || '',
      role: updatedUser.role || 'consumer',
      ...updatedUser
    };
  }

  async getAlgorithms(searchQuery?: string): Promise<ModeratedAlgorithm[]> {
    try {
      const query = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
      const response = await this.request<any>(`/algorithms/${query}`);
      
      let algorithmsArray: any[] = [];
      
      if (Array.isArray(response)) {
        algorithmsArray = response;
      } else if (response.results && Array.isArray(response.results)) {
        algorithmsArray = response.results;
      } else {
        algorithmsArray = Object.values(response);
      }
      
      return algorithmsArray.map(this.transformModeratedAlgorithm);
    } catch (error) {
      console.error('Failed to fetch algorithms:', error);
      throw error;
    }
  }

  async getAlgorithmById(id: string): Promise<ModeratedAlgorithm> {
    try {
      const algorithm: ApiAlgorithm = await this.request<ApiAlgorithm>(`/algorithms/${id}/`);
      return this.transformModeratedAlgorithm(algorithm);
    } catch (error) {
      console.error(`Failed to fetch algorithm ${id}:`, error);
      throw error;
    }
  }

  async purchaseAlgorithm(id: string): Promise<ModeratedAlgorithm> {
    const algorithm: ApiAlgorithm = await this.request<ApiAlgorithm>(`/algorithms/${id}/purchase/`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return this.transformModeratedAlgorithm(algorithm);
  }

  async getMyPurchases(): Promise<AlgorithmPurchaseItem[]> {
    const rows = await this.request<any[]>('/users/me/purchases/');
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => ({
      id: row.id,
      purchasedAt: row.purchased_at,
      purchasePrice: Number(row.purchase_price ?? 0),
      algorithm: this.transformModeratedAlgorithm(row.algorithm),
    }));
  }

  async getAlgorithmPriceHistory(id: string): Promise<PriceHistoryPoint[]> {
    const rows = await this.request<{ recorded_at: string; price: number }[]>(
      `/algorithms/${id}/price-history/`
    );
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => ({
      recordedAt: r.recorded_at,
      price: r.price,
    }));
  }

  async createAlgorithm(algorithmData: Partial<Algorithm>): Promise<Algorithm> {
    try {
      const apiAlgorithm = await this.request<ApiAlgorithm>('/algorithms/', {
        method: 'POST',
        body: JSON.stringify(this.prepareAlgorithmData(algorithmData)),
      });
      return this.transformAlgorithm(apiAlgorithm);
    } catch (error) {
      console.error('Failed to create algorithm:', error);
      throw error;
    }
  }

  async updateAlgorithm(id: string, algorithmData: Partial<Algorithm>): Promise<Algorithm> {
    const apiAlgorithm = await this.request<ApiAlgorithm>(`/algorithms/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(this.prepareAlgorithmData(algorithmData)),
    });
    return this.transformAlgorithm(apiAlgorithm);
  }

  // Методы для модерации
  async getModerationAlgorithms(): Promise<ModeratedAlgorithm[]> {
    try {
      const response = await this.request<any>('/algorithms/moderation/');
      
      let algorithmsArray: any[] = [];
      
      if (Array.isArray(response)) {
        algorithmsArray = response;
      } else if (response.results && Array.isArray(response.results)) {
        algorithmsArray = response.results;
      } else {
        algorithmsArray = Object.values(response);
      }
      
      return algorithmsArray.map(this.transformModeratedAlgorithm);
    } catch (error) {
      console.error('Failed to fetch moderation algorithms:', error);
      throw error;
    }
  }

  async getAllAlgorithms(): Promise<ModeratedAlgorithm[]> {
    try {
      const response = await this.request<any>('/algorithms/');
      
      let algorithmsArray: any[] = [];
      
      if (Array.isArray(response)) {
        algorithmsArray = response;
      } else if (response.results && Array.isArray(response.results)) {
        algorithmsArray = response.results;
      } else {
        algorithmsArray = Object.values(response);
      }
      
      console.log('Raw API response:', response);
      console.log('Processed algorithms array:', algorithmsArray);
      
      return algorithmsArray.map(this.transformModeratedAlgorithm);
    } catch (error) {
      console.error('Failed to fetch all algorithms:', error);
      throw error;
    }
  }

  async moderateAlgorithm(algorithmId: string, data: ModerationRequest): Promise<void> {
    try {
      await this.request(`/algorithms/moderation/${algorithmId}/`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('Failed to moderate algorithm:', error);
      throw error;
    }
  }

  private transformAlgorithm(apiAlgorithm: ApiAlgorithm): Algorithm {
    const isPaid = Boolean(apiAlgorithm.is_paid);
    const codeVisible =
      apiAlgorithm.code_visible !== undefined
        ? Boolean(apiAlgorithm.code_visible)
        : !isPaid;
    return {
      id: apiAlgorithm.id.toString(),
      title: apiAlgorithm.name,
      description: apiAlgorithm.description,
      author: apiAlgorithm.author_name,
      tags: apiAlgorithm.tegs ? apiAlgorithm.tegs.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
      isPaid,
      price: apiAlgorithm.price,
      code: apiAlgorithm.code,
      codeVisible,
      language: apiAlgorithm.language,
      compiler: apiAlgorithm.compiler,
      createdAt: apiAlgorithm.created_at,
      updatedAt: apiAlgorithm.updated_at,
    };
  }

  private transformModeratedAlgorithm(apiAlgorithm: any): ModeratedAlgorithm {
    const baseAlgorithm = this.transformAlgorithm(apiAlgorithm);
    return {
      ...baseAlgorithm,
      status: apiAlgorithm.status || 'pending',
      rejection_reason: apiAlgorithm.rejection_reason,
      moderated_by: apiAlgorithm.moderated_by,
      moderated_at: apiAlgorithm.moderated_at,
      author_name: apiAlgorithm.author_name || apiAlgorithm.author,
    };
  }

  private prepareAlgorithmData(algorithm: Partial<Algorithm>): any {
    const isPaid = Boolean(algorithm.isPaid);
    return {
      name: algorithm.title,
      description: algorithm.description,
      ...(algorithm.author ? { author_name: algorithm.author } : {}),
      tegs: algorithm.tags ? algorithm.tags.join(', ') : '',
      is_paid: isPaid,
      price: isPaid ? algorithm.price ?? 0 : 0,
      code: algorithm.code,
      language: algorithm.language ?? 'C++',
      compiler: algorithm.compiler ?? 'g++',
    };
  }
}

export const apiService = new ApiService();