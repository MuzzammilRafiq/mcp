import axios from "axios";
interface LocationData {
  ip: string;
  hostname: string;
  city: string;
  region: string;
  country: string;
  loc: string;
  org: string;
  postal: string;
  timezone: string;
  readme: string;
}

interface WeatherData {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  current_units: {
    time: string;
    interval: string;
    temperature_2m: string;
    wind_speed_10m: string;
  };
  current: {
    time: string;
    interval: number;
    temperature_2m: number;
    wind_speed_10m: number;
  };
  hourly_units: {
    time: string;
    temperature_2m: string;
    relative_humidity_2m: string;
    wind_speed_10m: string;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    wind_speed_10m: number[];
  };
}

const getLocationFromIp = async (ip: string): Promise<LocationData> => {
  const url = `https://ipinfo.io/${ip}/json`;
  try {
    const response = await axios.get<LocationData>(url);
    const locationData = response.data;
    return locationData;
  } catch (error: any) {
    console.log("Error fetching location data:", error.messege, "poop4");
    throw error;
  }
};

const getPublicIp = async (): Promise<string> => {
  const url = "https://api.ipify.org?format=json";
  try {
    const response = await axios.get<{ ip: string }>(url);
    return response.data.ip;
  } catch (error: any) {
    console.log("Error fetching public IP:", error.message, "poop3");
    throw error;
  }
};

const getMeridian = (time: string) => {
  const hour = parseInt(time.split("T")[1]!.split(":")[0]!);
  if (hour > 12) {
    return hour - 12 + " PM";
  } else if (hour === 0) {
    return "12 AM";
  } else {
    return hour + " AM";
  }
};

const getWeatherData = async (latitude: string, longitude: string) => {
  const url = `https:////api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&timezone=auto&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m`;
  // const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m`;
  try {
    const response = await axios.get<WeatherData>(url);
    const weatherData = response.data;
    // do some processing
    const time = weatherData.current.time.split(":")[0] + ":00";
    const index = weatherData.hourly.time.indexOf(time);
    const nextHrsTime = weatherData.hourly.time
      .slice(index, index + 5)
      .map((t) => getMeridian(t));
    const nextHrsTemp = weatherData.hourly.temperature_2m.slice(
      index,
      index + 5
    );
    const nextHrsHumidity = weatherData.hourly.relative_humidity_2m.slice(
      index,
      index + 5
    );
    return {
      time: nextHrsTime,
      temperature: nextHrsTemp,
      humidity: nextHrsHumidity,
    };
  } catch (error: any) {
    console.log(
      "Error fetching weather data:",
      error?.message,
      error?.stack,
      error?.response?.data,
      "poop2"
    );
    throw error;
  }
};

export const weatherService = async () => {
  try {
    const ip = await getPublicIp();
    const location = await getLocationFromIp(ip);
    const [latitude, longitude] = location.loc.split(",");
    const weather = await getWeatherData(latitude!, longitude!);
    return {
      city: location.city,
      weather,
    };
  } catch (error: any) {
    console.log("Error fetching weather data:", error.message, "poop1");
    throw new Error("internal error getting weather data api");
  }
};

console.log(JSON.stringify(await weatherService(), null, 2));
