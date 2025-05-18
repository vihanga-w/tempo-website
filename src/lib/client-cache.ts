export function getCachedObject<T>(key: string, cacheDuration?: number) {
    const data = localStorage.getItem(key);

    if (!data)
        return null;

    const obj: {
        updatedAt: number;
        data: T;
    } = JSON.parse(data);

    // 1 hour duration by default
    if (Date.now() - obj.updatedAt <= (cacheDuration ?? 3600e3))
        return obj.data;

    localStorage.removeItem(key);

    return null;
}

export function setCachedObject(key: string, data: Object | undefined) {
    if (!data) {
        localStorage.removeItem(key);
        
        return;
    }
    
    localStorage.setItem(key, JSON.stringify({
        updatedAt: Date.now(),
        data,
    }));
}