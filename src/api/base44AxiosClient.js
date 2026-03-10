export const createAxiosClient = ({ baseURL = '', headers = {}, token } = {}) => {
  const defaultHeaders = {
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const request = async (method, url, body) => {
    const res = await fetch(`${baseURL}${url}`, {
      method,
      headers: {
        ...defaultHeaders,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
      const err = new Error(typeof data === 'string' ? data : data?.message || res.statusText);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  };

  return {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    put: (url, body) => request('PUT', url, body),
    patch: (url, body) => request('PATCH', url, body),
    delete: (url) => request('DELETE', url)
  };
};
