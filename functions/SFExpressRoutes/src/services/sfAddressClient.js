const axios = require("axios");

const SF_ADDRESS_LOGIN_URL = "https://hksfadd.sf-express.com/api/address_api/login";
const SF_ADDRESS_AREA_URL = "https://hksfaddsit.sf-express.com/api/address_api/area";
const SF_ADDRESS_NETCODE_URL = "https://hksfaddsit.sf-express.com/api/address_api/netCode";
const SF_ADDRESS_DETAIL_URL = "https://hksfaddsit.sf-express.com/api/address_api/address";

async function fetchAddressToken() {
  const response = await axios.post(
    SF_ADDRESS_LOGIN_URL,
    {},
    {
      headers: {
        "api-key": process.env.SF_ADDRESS_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data?.data;
}

async function fetchAreaList(token) {
  const response = await axios.get(SF_ADDRESS_AREA_URL, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data?.data;
}

async function fetchNetCodeList({ token, typeId, areaId }) {
  const response = await axios.get(`${SF_ADDRESS_NETCODE_URL}?typeId=${typeId}&areaId=${areaId}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data?.data;
}

async function fetchPickupAddresses({ token, netCode, lang }) {
  return Promise.all(
    netCode.map(async (item) => {
      const response = await axios.get(`${SF_ADDRESS_DETAIL_URL}?lang=${lang}&netCode=${item}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data?.data;
    })
  );
}

module.exports = {
  fetchAddressToken,
  fetchAreaList,
  fetchNetCodeList,
  fetchPickupAddresses,
};