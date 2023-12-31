// src/handlers/list.ts

import { APIGatewayProxyHandler } from "aws-lambda";
import { EventModel } from "../models/event";
import { connectToDb, disconnectFromDb } from "../../../../core/utils/db";
import { Event } from "../../../../core/models/event.model";
import { Query } from "../../../../core/interfaces/search.interface";
import { defaultHeaders } from "../../../../core/headers/default.headers";
import { convertType } from "../../../../core/maps/convert-type";

export const listHandler: APIGatewayProxyHandler = async (event) => {
  await connectToDb();

  const { from, size, sort, select } = event.queryStringParameters || {};
  const query = event.queryStringParameters || ({} as Query<Event>);
  let mongoQuery = {};
  let sortQuery = {};
  ["query", "from", "size", "sort", "select"].forEach((key) => {
    if (event.queryStringParameters && event.queryStringParameters[key]) {
      delete event.queryStringParameters[key];
    }
  });

  if (sort) {
    if (sort.endsWith("_asc")) {
      sortQuery[sort.slice(0, -4)] = 1;
    } else if (sort.endsWith("_desc")) {
      sortQuery[sort.slice(0, -5)] = -1;
    } else {
      sortQuery[sort] = 1; // по умолчанию asc
    }
  }

  for (let [key, value] of Object.entries(query)) {
    if (typeof value === "object" && !Array.isArray(value)) {
      for (let [subKey, subValue] of Object.entries(value)) {
        subValue = convertType(subValue);
        const compositeKey = `${key}.${subKey}`;

        if (subKey.endsWith("_from")) {
          mongoQuery[compositeKey.slice(0, -5)] = { $gte: subValue };
        } else if (subKey.endsWith("_to")) {
          mongoQuery[compositeKey.slice(0, -3)] = { $lte: subValue };
        } else {
          console.log(compositeKey, subValue);
          mongoQuery[compositeKey] = subValue;
        }
      }
    } else {
      value = convertType(value);
      if (key.endsWith("_from")) {
        mongoQuery[key.slice(0, -5)] = { $gte: value };
      } else if (key.endsWith("_to")) {
        mongoQuery[key.slice(0, -3)] = { $lte: value };
      } else {
        mongoQuery[key] = value;
      }
    }
  }

  let projection = {};

  if (select) {
    const fields = select.split(",");
    for (const field of fields) {
      projection[field] = 1;
    }
  }

  const items = await EventModel.find(mongoQuery)
    .select(projection)
    .sort(sortQuery)
    .skip(Number(from || 0))
    .limit(Number(size || 100));

  await disconnectFromDb();

  return {
    statusCode: 200,
    headers: {
      ...defaultHeaders,
    },
    body: JSON.stringify(items),
  };
};
