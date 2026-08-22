import axios from "axios";

export class MovideskService {

    async getTickets() {

        const response = await axios.get(
            `${process.env.MOVIDESK_URL}/tickets`,
            {
                params: {

                    token: process.env.MOVIDESK_TOKEN,

                    $select:
                        "id,subject,status,category,createdDate,lastUpdate,ownerTeam,serviceFirstLevel"

                }
            }
        );

        return response.data;

    }

}