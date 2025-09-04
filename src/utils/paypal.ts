import { ApiError } from "./api-error";
import { PAYPAL_CLIENT_ID, PAYPAL_SECRET } from "./env";

export const paypalBaseUrl = {
  sandbox: "https://api-m.sandbox.paypal.com",
};
const generatePaypalAccessToken = async () => {
  try {
    const auth = Buffer.from(PAYPAL_CLIENT_ID + ":" + PAYPAL_SECRET).toString(
      "base64",
    );

    const response = await fetch(`${paypalBaseUrl.sandbox}/v1/oauth2/token`, {
      method: "POST",
      body: "grant_type=client_credentials",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });
    const data = await response.json();
    return data?.access_token;
  } catch (error) {
    throw new ApiError(500, "Error while generating paypal auth token");
  }
};

export const paypalAPI = async (endpoint: string, body = {}) => {
  const accessToken = await generatePaypalAccessToken();
  return await fetch(`${paypalBaseUrl.sandbox}/v2/checkout/orders${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
};
