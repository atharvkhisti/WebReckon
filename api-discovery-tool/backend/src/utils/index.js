export const truncateRequestBody = (body, maxLength = 1000) => {
    return body.length > maxLength ? body.substring(0, maxLength) + '...' : body;
};

export const truncateResponseBody = (body, maxLength = 1000) => {
    return body.length > maxLength ? body.substring(0, maxLength) + '...' : body;
};