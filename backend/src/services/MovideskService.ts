import axios from "axios";

export class MovideskService {

    private readonly url =
        process.env.MOVIDESK_URL?.trim() ||
        "https://api.movidesk.com/public/v1";

    private token() {
        const token = process.env.MOVIDESK_TOKEN?.trim();

        if (!token) {
            throw new Error(
                "A integração de escrita do Movidesk não está configurada. Informe MOVIDESK_TOKEN nas configurações do aplicativo."
            );
        }

        return token;
    }

    async getTickets() {

        const response = await axios.get(
            `${this.url}/tickets`,
            {
                params: {

                    token: this.token(),

                    $select:
                        "id,subject,status,category,createdDate,lastUpdate,ownerTeam,serviceFirstLevel"

                }
            }
        );

        return response.data;

    }

    async updateTicketStatus(
        ticketId: number,
        status: string,
        justification?: string | null,
    ) {
        const response = await axios.patch(
            `${this.url}/tickets`,
            {
                status,
                ...(justification?.trim()
                    ? { justification: justification.trim() }
                    : {}),
            },
            {
                params: {
                    token: this.token(),
                    id: ticketId,
                },
                timeout: 30_000,
            },
        );

        return response.data;
    }

}
