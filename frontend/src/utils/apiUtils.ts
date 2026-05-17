
export const formatPrice = (price?: number): string => {
  if (!price) return 'Бесплатно';
  return `${price} руб.`;
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const getLanguageColor = (language: string): string => {
  const colors: { [key: string]: string } = {
    'C++': '#f34b7d',
    'Python': '#3572A5',
    'Java': '#b07219',
    'TypeScript': '#2b7489',
  };
  return colors[language] || '#6c757d';
};