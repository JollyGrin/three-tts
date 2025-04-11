function merge(a: any, b: any): any {
    const merged: Record<string, any> = { };
    Object.keys(a).forEach((key) => {
        merged[key] = a[key];
    })

    Object.keys(b).forEach((key) => {
        const old = a[key];
        if(old) {
            merged[key] = merge(old, b[key]);
        } else {
            merged[key] = b[key];
        }
    })

    return merged;
}